import { setPhase, type Phase } from "./phase";
import { notifyPhaseChange } from "./notifications";
import { settleGame } from "./settlement";
import { resetShieldReminders, runShieldReminders } from "./shield-reminders";

/**
 * تنها نقطهٔ ورود برای تغییر فاز (پنل برگزارکننده و زمان‌بند خودکار هر دو از همین استفاده می‌کنند).
 * بعد از ذخیرهٔ فاز، اعلان سراسری می‌فرستد و در صورت رسیدن به CLOSED تسویهٔ نهایی را اجرا می‌کند.
 */
export async function transitionTo(phase: Phase, endsAt: Date | null) {
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
    await settleGame().catch((e) => console.error("settleGame failed", e));
  }
}
