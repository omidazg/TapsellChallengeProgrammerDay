import { setPhase, type Phase } from "./phase";
import { notifyPhaseChange } from "./notifications";
import { settleGame } from "./settlement";
import { closeAuctionsForGameEnd } from "./auction";

export type TransitionResult = {
  /** فقط وقتی true است که فاز مقصد CLOSED بود و تسویهٔ خودکار با خطا روبه‌رو شد. */
  settleFailed?: boolean;
};

/**
 * تنها نقطهٔ ورود برای تغییر فاز (پنل برگزارکننده و زمان‌بند خودکار هر دو از همین استفاده می‌کنند).
 * بعد از ذخیرهٔ فاز، اعلان سراسری می‌فرستد و در صورت رسیدن به CLOSED تسویهٔ نهایی را اجرا می‌کند.
 * شکست تسویه پرتاب نمی‌شود (فاز در هر حال عوض شده است) ولی در نتیجه گزارش می‌شود
 * تا پنل برگزارکننده بتواند به ادمین هشدار دهد و او از صفحهٔ تسویه دوباره اجرا کند.
 */
export async function transitionTo(phase: Phase, endsAt: Date | null): Promise<TransitionResult> {
  await setPhase(phase, endsAt);
  await notifyPhaseChange(phase).catch((e) => console.error("notifyPhaseChange failed", e));
  if (phase === "CLOSED") {
    // حراج زندهٔ روز بازار پیش از تسویه بسته می‌شود تا خرید برنده در امتیاز حساب شود.
    await closeAuctionsForGameEnd().catch((e) => console.error("closeAuctionsForGameEnd failed", e));
    try {
      await settleGame();
    } catch (e) {
      console.error("settleGame failed", e);
      return { settleFailed: true };
    }
  }
  return {};
}
