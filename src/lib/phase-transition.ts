import { setPhase, type Phase } from "./phase";
import { notifyPhaseChange } from "./notifications";
import { settleGame } from "./settlement";

/**
 * تنها نقطهٔ ورود برای تغییر فاز (پنل برگزارکننده و زمان‌بند خودکار هر دو از همین استفاده می‌کنند).
 * بعد از ذخیرهٔ فاز، اعلان سراسری می‌فرستد و در صورت رسیدن به CLOSED تسویهٔ نهایی را اجرا می‌کند.
 */
export async function transitionTo(phase: Phase, endsAt: Date | null) {
  await setPhase(phase, endsAt);
  await notifyPhaseChange(phase).catch((e) => console.error("notifyPhaseChange failed", e));
  if (phase === "CLOSED") {
    await settleGame().catch((e) => console.error("settleGame failed", e));
  }
}
