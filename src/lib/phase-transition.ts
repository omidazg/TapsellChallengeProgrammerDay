import { setPhase, type Phase } from "./phase";
import { notifyPhaseChange } from "./notifications";
import { settleGame } from "./settlement";
import { resetShieldReminders, runShieldReminders } from "./shield-reminders";

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
  if (phase === "REGISTRATION" || phase === "IDEATION") {
    // دور تازهٔ بازی: یادآورهای یک‌بارهٔ سپر دوباره قابل ارسال شوند.
    await resetShieldReminders().catch((e) => console.error("resetShieldReminders failed", e));
  } else if (phase === "SEED_ROUND" || phase === "BUILD") {
    // یادآور سپر به دارندگانی که هنوز انتخاب نکرده‌اند (یک‌باره؛ زمان‌بند هم همین را هر تیک بررسی می‌کند).
    await runShieldReminders().catch((e) => console.error("runShieldReminders failed", e));
  }
  if (phase === "CLOSED") {
    try {
      await settleGame();
    } catch (e) {
      console.error("settleGame failed", e);
      return { settleFailed: true };
    }
  }
  return {};
}
