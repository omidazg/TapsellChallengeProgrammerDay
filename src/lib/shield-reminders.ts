/**
 * یادآور قدرت «سپر» برای دارندگانی که هنوز هدفی انتخاب نکرده‌اند.
 *
 * انتخاب سپر فقط در SEED_ROUND و BUILD باز است و اگر دارنده تا شروع روز بازار انتخاب نکند،
 * قدرتش هدر می‌رود. سه یادآور یک‌باره داریم:
 *   - SEED_ROUND_ENDING: حدود ۳۰ دقیقه پیش از پایان دور سرمایه‌گذاری (هم برای کسی که
 *     سرمایه‌گذاری واجد شرایط دارد، هم برای کسی که هنوز ندارد: «اول سرمایه‌گذاری کن، بعد انتخاب»)؛
 *   - BUILD_START: به‌محض ورود به «ساخت محصول» (یعنی پایان دور سرمایه‌گذاری)؛
 *   - BUILD_ENDING: حدود ۳۰ دقیقه پیش از پایان «ساخت محصول» (آخرین فرصت).
 * در BUILD فقط به کسی یادآوری می‌شود که دست‌کم یک سرمایه‌گذاری واجد شرایط دارد (دیگر
 * نمی‌شود سرمایه‌گذاری کرد، پس بقیه کاری از دستشان برنمی‌آید).
 *
 * یک‌باره بودن (idempotency): هر یادآور پیش از ارسال با ساختن یک ردیف Setting با کلید
 * `shield_reminder:<TRIGGER>` «رزرو» می‌شود. کلید Setting یکتاست، پس از میان تیک‌های تکراری،
 * ری‌استارت‌ها و فراخوانی هم‌زمان (زمان‌بند + transitionTo) فقط یکی موفق می‌شود و بقیه با خطای
 * یکتایی بی‌صدا رد می‌شوند. این پرچم‌ها هنگام برگشت به REGISTRATION/IDEATION و در
 * scripts/reset-game.ts پاک می‌شوند تا دور بعدی بازی دوباره یادآور بگیرد.
 */
import { prisma } from "./db";
import { getPhase } from "./phase";
import { PHASE_LABEL, type Phase } from "./phases";
import { notifyUsers } from "./notifications";

export const SHIELD_REMINDER_KIND = "SHIELD_REMINDER";
export const SHIELD_REMINDER_TITLE = "سپرت را فعال کن 🛡️";
/** فاصلهٔ یادآور «رو به پایان» تا زمان پایان فاز (دقیقه). */
export const SHIELD_REMINDER_LEAD_MIN = 30;
const FLAG_PREFIX = "shield_reminder:";

export type ShieldReminderTrigger = "SEED_ROUND_ENDING" | "BUILD_START" | "BUILD_ENDING";

type PendingHolder = { userId: string; hasCandidate: boolean };

/**
 * دارندگان سپری که هنوز انتخاب نکرده‌اند، به‌همراه اینکه آیا دست‌کم یک سرمایه‌گذاری واجد شرایط
 * (غیر selfFunded، روی تیم دیگر، جمع مثبت — همان قاعدهٔ shieldCandidates) دارند یا نه.
 * با دو پرس‌وجو برای همهٔ دارندگان، نه یکی به‌ازای هر کاربر.
 */
export async function pendingShieldHolders(): Promise<PendingHolder[]> {
  const holders = await prisma.user.findMany({
    where: { power: "SHIELD", powerUsed: false, shieldTeamId: null },
    select: { id: true, teamId: true },
  });
  if (holders.length === 0) return [];
  const investments = await prisma.investment.findMany({
    where: { userId: { in: holders.map((h) => h.id) }, selfFunded: false },
    select: { userId: true, amount: true, idea: { select: { teamId: true } } },
  });
  const teamOf = new Map(holders.map((h) => [h.id, h.teamId]));
  const sums = new Map<string, Map<string, number>>(); // userId → (teamId → جمع مبلغ)
  for (const inv of investments) {
    const teamId = inv.idea.teamId;
    if (teamId === teamOf.get(inv.userId)) continue; // تیم خودت هرگز
    const perTeam = sums.get(inv.userId) ?? new Map<string, number>();
    perTeam.set(teamId, (perTeam.get(teamId) ?? 0) + inv.amount);
    sums.set(inv.userId, perTeam);
  }
  return holders.map((h) => ({
    userId: h.id,
    hasCandidate: [...(sums.get(h.id)?.values() ?? [])].some((sum) => sum > 0),
  }));
}

/**
 * رزرو اتمی یک یادآور؛ true فقط برای اولین فراخواننده. INSERT OR IGNORE روی کلید یکتای Setting
 * هم اتمی است و هم برخلاف create+catch، در تیک‌های تکراری خطای یکتایی در لاگ Prisma نمی‌سازد.
 */
async function claim(trigger: ShieldReminderTrigger): Promise<boolean> {
  const key = FLAG_PREFIX + trigger;
  const value = new Date().toISOString();
  const inserted = await prisma.$executeRaw`INSERT OR IGNORE INTO "Setting" ("key", "value") VALUES (${key}, ${value})`;
  return inserted > 0;
}

const BODY_PICK = "قدرت سپر فقط تا پیش از شروع روز بازار قابل انتخاب است؛ از کیف پول یکی از سرمایه‌گذاری‌هایت را بیمه کن.";
const BODY_INVEST_FIRST = `هنوز روی ایدهٔ هیچ تیم دیگری سرمایه‌گذاری نکرده‌ای. تا «${PHASE_LABEL.SEED_ROUND}» تمام نشده سرمایه‌گذاری کن و بعد از کیف پول سپر را روی یکی از آن‌ها بگذار؛ وگرنه این قدرت هدر می‌رود.`;
const bodyEnding = (phase: Phase) =>
  `کمتر از ${SHIELD_REMINDER_LEAD_MIN} دقیقه تا پایان «${PHASE_LABEL[phase]}» مانده. ${BODY_PICK}`;

/** ارسال یک یادآور مشخص (اگر قبلاً ارسال نشده باشد). تعداد گیرندگان را برمی‌گرداند. */
export async function sendShieldReminder(trigger: ShieldReminderTrigger): Promise<number> {
  if (!(await claim(trigger))) return 0;
  const holders = await pendingShieldHolders();

  const pick = holders.filter((h) => h.hasCandidate).map((h) => h.userId);
  const investFirst = trigger === "SEED_ROUND_ENDING" ? holders.filter((h) => !h.hasCandidate).map((h) => h.userId) : [];

  const pickBody =
    trigger === "BUILD_START" ? BODY_PICK : bodyEnding(trigger === "SEED_ROUND_ENDING" ? "SEED_ROUND" : "BUILD");
  await notifyUsers(pick, { kind: SHIELD_REMINDER_KIND, title: SHIELD_REMINDER_TITLE, body: pickBody, href: "/wallet" });
  await notifyUsers(investFirst, {
    kind: SHIELD_REMINDER_KIND,
    title: SHIELD_REMINDER_TITLE,
    body: BODY_INVEST_FIRST,
    href: "/invest",
  });
  const total = pick.length + investFirst.length;
  if (total > 0) console.log(`[shield-reminder] ${trigger}: ${total} یادآور سپر ارسال شد`);
  return total;
}

/**
 * بررسی دوره‌ای (هر تیک زمان‌بند) و هنگام تغییر فاز: یادآورهایی که وقتشان رسیده را یک‌باره می‌فرستد.
 * `now` فقط برای تست قابل تزریق است.
 */
export async function runShieldReminders(now: Date = new Date()): Promise<void> {
  const { phase, endsAt } = await getPhase();
  if (phase !== "SEED_ROUND" && phase !== "BUILD") return;

  const remainingMs = endsAt ? endsAt.getTime() - now.getTime() : null;
  const endingSoon = remainingMs != null && remainingMs > 0 && remainingMs <= SHIELD_REMINDER_LEAD_MIN * 60_000;

  if (phase === "SEED_ROUND") {
    if (endingSoon) await sendShieldReminder("SEED_ROUND_ENDING");
    return;
  }

  // BUILD: اگر فاز از اول کوتاه‌تر از پنجرهٔ یادآور باشد، به‌جای دو اعلان پشت‌سرهم فقط
  // یادآور «رو به پایان» می‌رود و BUILD_START بی‌صدا رزرو می‌شود.
  if (endingSoon) {
    await claim("BUILD_START");
    await sendShieldReminder("BUILD_ENDING");
  } else {
    await sendShieldReminder("BUILD_START");
  }
}

/** پاک‌کردن پرچم‌های یادآور (شروع دور تازهٔ بازی). */
export async function resetShieldReminders(): Promise<void> {
  await prisma.setting.deleteMany({ where: { key: { startsWith: FLAG_PREFIX } } });
}
