/**
 * زمان‌بند خودکار بازی.
 * `runScheduledTasks` هر ۳۰ ثانیه از `instrumentation.ts` فراخوانی می‌شود (و یک‌بار هم دستی/در اسموک‌تست).
 * idempotent است و با یک قفل در-فرآیندی تضمین می‌کند دو اجرا هم‌زمان روی هم نیفتند؛
 * هر بخش در try/catch جدا اجرا می‌شود تا خطای یکی مانع بقیه نشود.
 */
import { prisma } from "./db";
import { getPhase, getSetting, getSettingInt } from "./phase";
import { PHASES, type Phase } from "./phases";
import { transitionTo } from "./phase-transition";
import { ensureAuctions, startNextAuction, settleIfEnded } from "./auction";
import { closeDueSlots } from "./adslots";
import { log } from "./log";
import { alert } from "./alert";

/** مدت پیش‌فرض هر فاز بر حسب ساعت؛ فازهای بدون مقدار (REGISTRATION، CLOSED) زمان پایان ندارند. */
const DEFAULT_PHASE_HOURS: Partial<Record<Phase, number>> = {
  IDEATION: 24,
  SEED_ROUND: 24,
  BUILD: 48,
  MARKET: 6,
  AUCTION: 2,
};

const DEFAULT_AUCTION_GAP_SEC = 60;

/** حداکثر یک‌بار در ساعت اجرا می‌شود؛ چون فقط پاک‌سازی است، نیازی به ماندگاری در Setting نیست. */
const NOTIFICATION_CLEANUP_INTERVAL_MS = 3600_000;
const NOTIFICATION_READ_TTL_MS = 7 * 24 * 3600_000;
const NOTIFICATION_MAX_AGE_MS = 30 * 24 * 3600_000;
let lastNotificationCleanupAt = 0;

function nextPhaseOf(p: Phase): Phase | null {
  const idx = PHASES.indexOf(p);
  if (idx < 0 || idx >= PHASES.length - 1) return null;
  return PHASES[idx + 1];
}

/** قفل در-فرآیندی: اجراهای هم‌پوشان نادیده گرفته می‌شوند. */
let running = false;

/** زمان آخرین تیک *موفق* (برای /api/health)؛ فقط در حافظهٔ همین پردازش نگه داشته می‌شود. */
let lastSuccessfulTickAt: number | null = null;

/** لاگ ساختاریافته + هشدار throttle‌شده برای شکست یک بخش از تیک زمان‌بند؛ isolation بین بخش‌ها حفظ می‌شود. */
function reportTickFailure(task: string, e: unknown) {
  console.error(`[scheduler] ${task} failed`, e);
  log.error("scheduler_task_failed", { task, error: e instanceof Error ? e : new Error(String(e)) });
  void alert("scheduler", `اجرای بخش ${task} از زمان‌بند بازی با خطا مواجه شد`, { task });
}

export async function runScheduledTasks(): Promise<void> {
  if (running) {
    console.log("[scheduler] skip: اجرای قبلی هنوز تمام نشده است");
    return;
  }
  running = true;
  try {
    await autoAdvancePhase().catch((e) => reportTickFailure("autoAdvancePhase", e));
    await cleanupOldNotifications().catch((e) => reportTickFailure("cleanupOldNotifications", e));

    const { phase } = await getPhase();
    if (phase === "AUCTION") {
      await runAuctionTasks().catch((e) => reportTickFailure("runAuctionTasks", e));
    } else if (phase === "MARKET") {
      await runMarketTasks().catch((e) => reportTickFailure("runMarketTasks", e));
    }
    lastSuccessfulTickAt = Date.now();
  } catch (e) {
    // خطای غیرمنتظره بیرون از بخش‌های جداگانه (مثلاً خود getPhase) — لاگ/هشدار و سپس
    // propagate تا رفتار قبلی (لاگ در فراخوانندهٔ instrumentation.ts) حفظ شود.
    reportTickFailure("tick", e);
    throw e;
  } finally {
    running = false;
  }
}

/** زمان آخرین تیک موفق زمان‌بند (ms epoch)، یا null اگر هنوز هیچ تیکی موفق نشده. */
export function getLastSchedulerTickAt(): number | null {
  return lastSuccessfulTickAt;
}

/** ۱.الف: پیشروی خودکار فاز وقتی زمانش تمام شده باشد. */
async function autoAdvancePhase() {
  const autoAdvance = await getSetting("auto_advance", "0");
  if (autoAdvance !== "1") return;

  const { phase, endsAt } = await getPhase();
  if (phase === "CLOSED") return;
  if (!endsAt || endsAt.getTime() > Date.now()) return;

  const next = nextPhaseOf(phase);
  if (!next) return;

  const defaultHours = DEFAULT_PHASE_HOURS[next] ?? null;
  let nextEndsAt: Date | null = null;
  if (defaultHours != null) {
    const hours = await getSettingInt(`phase_hours_${next}`, defaultHours);
    nextEndsAt = new Date(Date.now() + hours * 3600 * 1000);
  }

  await transitionTo(next, nextEndsAt);
  console.log(
    `[scheduler] فاز خودکار از ${phase} به ${next} رفت${nextEndsAt ? ` (پایان: ${nextEndsAt.toISOString()})` : ""}`
  );
}

/** ۱.ب: در فاز AUCTION، تسویهٔ حراج‌های تمام‌شده و شروع خودکار حراج بعدی. */
async function runAuctionTasks() {
  await ensureAuctions();

  const liveAuctions = await prisma.auction.findMany({ where: { status: "LIVE" } });
  for (const a of liveAuctions) {
    if (!a.endsAt || a.endsAt.getTime() > Date.now()) continue;
    const settled = await settleIfEnded(a.id);
    if (settled) {
      await setLastAuctionEndedAt(new Date());
      console.log(`[scheduler] حراج ${a.id} تسویه شد`);
    }
  }

  const autoAuction = await getSetting("auto_auction", "0");
  if (autoAuction !== "1") return;

  const stillLive = await prisma.auction.findFirst({ where: { status: "LIVE" } });
  if (stillLive) return;

  const gapSec = await getSettingInt("auction_gap_sec", DEFAULT_AUCTION_GAP_SEC);
  const lastEndedRaw = await getSetting("last_auction_ended_at", "");
  if (lastEndedRaw) {
    const lastEnded = new Date(lastEndedRaw);
    if (!Number.isNaN(lastEnded.getTime()) && Date.now() - lastEnded.getTime() < gapSec * 1000) return;
  }

  const started = await startNextAuction();
  if (started) console.log(`[scheduler] حراج بعدی ${started.id} خودکار شروع شد`);
}

async function setLastAuctionEndedAt(d: Date) {
  await prisma.setting.upsert({
    where: { key: "last_auction_ended_at" },
    update: { value: d.toISOString() },
    create: { key: "last_auction_ended_at", value: d.toISOString() },
  });
}

/** ۱.ج: در فاز MARKET، بستن جایگاه‌های تبلیغاتی که ساعتشان رسیده. */
async function runMarketTasks() {
  const closed = await closeDueSlots();
  if (closed.length > 0) console.log(`[scheduler] ${closed.length} جایگاه تبلیغاتی بسته شد`);
}

/**
 * ۱.د: پاک‌سازی سبک اعلان‌های قدیمی — حداکثر یک‌بار در ساعت اجرا می‌شود (قفل درون‌حافظه‌ای،
 * مستقل از فاز بازی). دو دسته حذف می‌شوند: خوانده‌شده و قدیمی‌تر از ۷ روز، یا هر اعلان
 * (خوانده‌شده یا نه) قدیمی‌تر از ۳۰ روز.
 */
export async function cleanupOldNotifications() {
  const now = Date.now();
  if (now - lastNotificationCleanupAt < NOTIFICATION_CLEANUP_INTERVAL_MS) return;
  lastNotificationCleanupAt = now;

  const readCutoff = new Date(now - NOTIFICATION_READ_TTL_MS);
  const hardCutoff = new Date(now - NOTIFICATION_MAX_AGE_MS);

  const result = await prisma.notification.deleteMany({
    where: {
      OR: [{ readAt: { not: null, lt: readCutoff } }, { createdAt: { lt: hardCutoff } }],
    },
  });
  if (result.count > 0) console.log(`[scheduler] ${result.count} اعلان قدیمی پاک شد`);
}
