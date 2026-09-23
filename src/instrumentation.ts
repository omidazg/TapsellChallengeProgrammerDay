/**
 * نقطهٔ ورود instrumentation نکست‌جی‌اس (از نسخهٔ ۱۵ به بعد پایدار و به‌طور پیش‌فرض فعال است،
 * بدون نیاز به فلگ تجربی). چون این پروژه پوشهٔ `src` دارد، فایل باید همین‌جا
 * (کنار `src/app`) باشد؛ نکست‌جی‌اس خودش آن را در شروع سرور پیدا و یک‌بار اجرا می‌کند.
 *
 * اینجا هر ۳۰ ثانیه `runScheduledTasks` را صدا می‌زنیم (و یک‌بار هم پس از ۵ ثانیهٔ اول،
 * تا بازی معطل اولین تیک نماند). فقط روی ران‌تایم Node اجرا می‌شود (نه Edge) و با
 * `SCHEDULER_DISABLED=1` می‌توان کامل خاموشش کرد (مثلاً در تست یا build).
 */

import type { Instrumentation } from "next";

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

/**
 * قلاب خطای نکست‌جی‌اس (Node runtime؛ از v15 پایدار است) — برای خطاهای رندر/route handler
 * که به مرزهای خطای معمولی (error.tsx) نرسیدند یا در همان سطح رخ دادند. فقط مسیر و متد
 * لاگ/هشدار می‌شود؛ هیچ کوکی یا هدری (که می‌تواند حاوی سشن/سکرت باشد) ثبت نمی‌شود.
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { log } = await import("./lib/log");
  const { alert } = await import("./lib/alert");

  const err = error instanceof Error ? error : new Error(String(error));
  const digest = typeof error === "object" && error !== null && "digest" in error ? String((error as { digest?: unknown }).digest) : undefined;

  log.error("request_error", {
    error: err,
    digest,
    path: request.path,
    method: request.method,
    routerKind: context.routerKind,
    routeType: context.routeType,
    routePath: context.routePath,
  });

  void alert("request_error", `خطا در ${request.method} ${request.path}`, {
    digest,
    routeType: context.routeType,
  });
};
