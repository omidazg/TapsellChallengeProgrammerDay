/**
 * نقطهٔ ورود instrumentation نکست‌جی‌اس (از نسخهٔ ۱۵ به بعد پایدار و به‌طور پیش‌فرض فعال است،
 * بدون نیاز به فلگ تجربی). چون این پروژه پوشهٔ `src` دارد، فایل باید همین‌جا
 * (کنار `src/app`) باشد؛ نکست‌جی‌اس خودش آن را در شروع سرور پیدا و یک‌بار اجرا می‌کند.
 *
 * اینجا هر ۳۰ ثانیه `runScheduledTasks` را صدا می‌زنیم (و یک‌بار هم پس از ۵ ثانیهٔ اول،
 * تا بازی معطل اولین تیک نماند). فقط روی ران‌تایم Node اجرا می‌شود (نه Edge) و با
 * `SCHEDULER_DISABLED=1` می‌توان کامل خاموشش کرد (مثلاً در تست یا build).
 */

const INTERVAL_MS = 30_000;
const FIRST_RUN_DELAY_MS = 5_000;

// register() ممکن است در حالت dev بیش از یک‌بار فراخوانی شود (مثلاً با Turbopack HMR)؛
// فلگ سراسری از ساخت چند تایمر موازی جلوگیری می‌کند.
type SchedulerGlobal = typeof globalThis & { __arenaSchedulerStarted?: boolean };

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.SCHEDULER_DISABLED === "1") return;

  const g = globalThis as SchedulerGlobal;
  if (g.__arenaSchedulerStarted) return;
  g.__arenaSchedulerStarted = true;

  const { runScheduledTasks } = await import("./lib/scheduler");

  const run = () => {
    runScheduledTasks().catch((e) => console.error("[scheduler] runScheduledTasks failed", e));
  };

  setTimeout(run, FIRST_RUN_DELAY_MS);
  setInterval(run, INTERVAL_MS);

  console.log(`[scheduler] instrumentation فعال شد؛ هر ${INTERVAL_MS / 1000} ثانیه اجرا می‌شود`);
}
