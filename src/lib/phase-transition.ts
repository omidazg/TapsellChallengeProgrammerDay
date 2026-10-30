import { setPhase, type Phase } from "./phase";
import { notifyPhaseChange } from "./notifications";
import { resettleGame, settleGame } from "./settlement";
import { closeAuctionsForGameEnd } from "./auction";
import { refundUndeliveredAdSlots } from "./adslots";
import { snapshotBazaarStats } from "./bazaar";
import { runFinalAiEvaluation } from "./jury-ai";
import { log } from "./log";
import { alert } from "./alert";

export type TransitionResult = {
  /** فقط وقتی true است که فاز مقصد CLOSED بود و تسویهٔ خودکار با خطا روبه‌رو شد. */
  settleFailed?: boolean;
};

/** شکست یک گام پایان بازی: لاگ ساختاریافته + هشدار (نه فقط console)، تا برگزارکننده فوراً ببیند. */
function reportGameEndFailure(step: string, e: unknown) {
  const error = e instanceof Error ? e : new Error(String(e));
  console.error(`[game-end] ${step} failed`, error);
  log.error("game_end_step_failed", { step, error });
  void alert("game_end", `گام «${step}» در پایان بازی با خطا روبه‌رو شد؛ فوراً بررسی کن`, { step });
}

/**
 * تنها نقطهٔ ورود برای تغییر فاز (پنل برگزارکننده و زمان‌بند خودکار هر دو از همین استفاده می‌کنند).
 * بعد از ذخیرهٔ فاز، اعلان سراسری می‌فرستد و در صورت رسیدن به CLOSED تسویهٔ نهایی را اجرا می‌کند.
 * شکست تسویه پرتاب نمی‌شود (فاز در هر حال عوض شده است) ولی در نتیجه گزارش می‌شود
 * تا پنل برگزارکننده بتواند به ادمین هشدار دهد و او از صفحهٔ تسویه دوباره اجرا کند.
 *
 * رسیدن به CLOSED همیشه تسویه را (دوباره) اجرا می‌کند: اگر برگزارکننده پیش از پایان بازی تسویه کرده
 * باشد، نتیجه با همهٔ فعالیت‌ها تا لحظهٔ CLOSED بازمحاسبه و جایگزین می‌شود (تسویهٔ قطعی در settleGame).
 */
export async function transitionTo(phase: Phase, endsAt: Date | null): Promise<TransitionResult> {
  await setPhase(phase, endsAt);
  await notifyPhaseChange(phase).catch((e) => console.error("notifyPhaseChange failed", e));
  if (phase === "CLOSED") {
    // برداشت نهایی آمار بازار در ددلاین.
    await snapshotBazaarStats().catch((e) => reportGameEndFailure("snapshotBazaarStats", e));
    // حراج زنده پیش از تسویه بسته می‌شود تا خرید برنده در امتیاز حساب شود.
    // اگر این گام شکست بخورد، تسویه ادامه می‌یابد و حراج زندهٔ باقی‌مانده دیگر تسویه نمی‌شود
    // (settleCore پس از CLOSED جز در مسیر پایان بازی تسویه نمی‌کند) — پس خطا باید بلند گزارش شود.
    await closeAuctionsForGameEnd().catch((e) => reportGameEndFailure("closeAuctionsForGameEnd", e));
    // جایگاه‌های تبلیغاتی تحویل‌نشده به خریدار برمی‌گردند (اثری بر امتیاز ندارد).
    await refundUndeliveredAdSlots().catch((e) => reportGameEndFailure("refundUndeliveredAdSlots", e));
    try {
      await settleGame();
    } catch (e) {
      reportGameEndFailure("settleGame", e);
      return { settleFailed: true };
    }
    // ارزیابی نهایی هوش مصنوعی زمان‌بر است و نباید پنل را نگه دارد؛ بعد از آن امتیازها بازمحاسبه می‌شوند.
    void runFinalAiEvaluation()
      .then((r) => (r.done > 0 ? resettleGame() : undefined))
      .catch((e) => reportGameEndFailure("runFinalAiEvaluation", e));
  }
  return {};
}
