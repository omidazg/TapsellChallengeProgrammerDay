/**
 * زمان‌بند خودکار بازی.
 * `runScheduledTasks` هر ۳۰ ثانیه از `instrumentation.ts` فراخوانی می‌شود (و یک‌بار هم دستی/در اسموک‌تست).
 * idempotent است و با یک قفل در-فرآیندی تضمین می‌کند دو اجرا هم‌زمان روی هم نیفتند؛
 * هر بخش در try/catch جدا اجرا می‌شود تا خطای یکی مانع بقیه نشود.
 */
import { prisma } from "./db";
import { getPhase, getSetting, getSettingInt } from "./phase";
import { transitionTo } from "./phase-transition";
import { startNextAuction, settleIfEnded } from "./auction";
import { sendDuePushSlots } from "./adslots";
import { syncBazaarStats } from "./bazaar";
import { moduleOpen } from "./module-state";
import { log } from "./log";
import { alert } from "./alert";

const DEFAULT_AUCTION_GAP_SEC = 60;

/** حداکثر یک‌بار در ساعت اجرا می‌شود؛ چون فقط پاک‌سازی است، نیازی به ماندگاری در Setting نیست. */
const NOTIFICATION_CLEANUP_INTERVAL_MS = 3600_000;
const NOTIFICATION_READ_TTL_MS = 7 * 24 * 3600_000;
const NOTIFICATION_MAX_AGE_MS = 30 * 24 * 3600_000;
let lastNotificationCleanupAt = 0;

/** قفل در-فرآیندی: اجراهای هم‌پوشان نادیده گرفته می‌شوند. */
let running = false;

/**
 * زمان آخرین تیک *موفق* (برای /api/health)؛ فقط در حافظهٔ همین پردازش نگه داشته می‌شود.
 * روی globalThis است، نه متغیر ماژول: در production، instrumentation.ts و route سلامت هر کدام
 * نمونهٔ جدای این ماژول را بارگذاری می‌کنند و متغیر ماژول در route سلامت همیشه null می‌ماند.
 */
type TickGlobal = typeof globalThis & { __arenaLastTickAt?: number | null };
const tickGlobal = globalThis as TickGlobal;

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
    await closeAtDeadline().catch((e) => reportTickFailure("closeAtDeadline", e));
    await cleanupOldNotifications().catch((e) => reportTickFailure("cleanupOldNotifications", e));
    await syncBazaarStats().catch((e) => reportTickFailure("syncBazaarStats", e));

    const { phase } = await getPhase();
    if (phase !== "CLOSED") {
      // بازار و حراج یک بخش‌اند: وقتی بازار باز نیست حراج تازه‌ای شروع نمی‌شود، ولی حراج زندهٔ تمام‌شده باید تسویه شود.
      await runAuctionTasks().catch((e) => reportTickFailure("runAuctionTasks", e));
      await sendDuePushSlots().catch((e) => reportTickFailure("sendDuePushSlots", e));
    }
    tickGlobal.__arenaLastTickAt = Date.now();
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
  return tickGlobal.__arenaLastTickAt ?? null;
}

/** ۱.الف: ددلاین نهایی تنها زمان‌بندی مسابقه است و با رسیدنش مسابقه خودکار بسته می‌شود. */
async function closeAtDeadline() {
  const { phase, endsAt } = await getPhase();
  if (phase === "CLOSED" || !endsAt || endsAt.getTime() > Date.now()) return;

  // ادعای شرطی برای جلوگیری از مسابقه با بستن دستی از پنل
  const claimed = await prisma.setting.updateMany({ where: { key: "phase", NOT: { value: "CLOSED" } }, data: { value: "CLOSED" } });
  if (claimed.count === 0) return;

  const res = await transitionTo("CLOSED", endsAt);
  // همان ردیفی که پایان دستی می‌نویسد؛ خبر عمومی «مسابقه به پایان رسید» در فید از این می‌آید.
  await prisma.auditLog.create({ data: { actorId: null, action: "contest.end", target: "", detail: JSON.stringify({ auto: true }) } });
  if (res.settleFailed) reportTickFailure("settleGame", new Error("تسویهٔ خودکار پس از ددلاین نهایی شکست خورد"));
  console.log("[scheduler] ددلاین نهایی رسید و مسابقه بسته شد");
}

/** ۱.ب: تسویهٔ حراج‌های تمام‌شده و شروع خودکار حراج بعدیِ صف (صف را تیم‌ها پر می‌کنند). */
async function runAuctionTasks() {
  const liveAuctions = await prisma.auction.findMany({ where: { status: "LIVE" } });
  for (const a of liveAuctions) {
    if (!a.endsAt || a.endsAt.getTime() > Date.now()) continue;
    const settled = await settleIfEnded(a.id);
    if (settled) {
      await setLastAuctionEndedAt(new Date());
      console.log(`[scheduler] حراج ${a.id} تسویه شد`);
    }
  }

  const autoAuction = await getSetting("auto_auction", "1");
  if (autoAuction !== "1" || !(await moduleOpen("market"))) return;

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

/**
 * ۱.ج: پاک‌سازی سبک اعلان‌های قدیمی — حداکثر یک‌بار در ساعت اجرا می‌شود (قفل درون‌حافظه‌ای،
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
