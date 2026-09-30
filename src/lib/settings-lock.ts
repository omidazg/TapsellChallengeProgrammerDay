import type { Phase } from "./phases";

/**
 * قفل تنظیمات اقتصادی بازی پس از شروع.
 * قوانین اقتصادی (کیف‌ها، سقف‌ها، جریمه، گام حراج) باید پیش از شروع بازی ثابت و شفاف باشند؛
 * به محض خروج از فاز REGISTRATION دیگر برگزارکننده نمی‌تواند آن‌ها را تغییر دهد.
 * کلیدهای عملیاتی (زمان‌بندی/لجستیک) مثل market_starts_at و auction_duration_sec
 * و همهٔ تنظیمات زمان‌بند خودکار همچنان قابل‌تغییر می‌مانند.
 *
 * این ماژول عمداً بدون وابستگی به دیتابیس است تا هم در سرور و هم در تست قابل استفاده باشد.
 */

/** کلیدهای اقتصادی که پس از شروع بازی قفل می‌شوند */
export const LOCKED_AFTER_START_KEYS = [
  "seed_wallet",
  "buy_wallet",
  "max_per_target",
  "penalty_per_coin",
  "bid_increment",
] as const;
export type LockedSettingKey = (typeof LOCKED_AFTER_START_KEYS)[number];

/** تنها فازی که در آن تنظیمات اقتصادی هنوز قابل‌تغییرند */
export const SETTINGS_EDITABLE_PHASE: Phase = "REGISTRATION";

export function isLockedSettingKey(key: string): key is LockedSettingKey {
  return (LOCKED_AFTER_START_KEYS as readonly string[]).includes(key);
}

/** آیا در فاز داده‌شده تنظیمات اقتصادی قفل‌اند؟ (هر فازی جز REGISTRATION) */
export function areEconomySettingsLocked(phase: Phase): boolean {
  return phase !== SETTINGS_EDITABLE_PHASE;
}

/** مقایسهٔ دو مقدار تنظیمات؛ اگر هر دو عدد باشند عددی مقایسه می‌شوند («0.50» با 0.5 برابر است) */
function sameValue(before: string | number | undefined, after: string | number): boolean {
  const a = String(before ?? "").trim();
  const b = String(after).trim();
  if (a === b) return true;
  if (a === "" || b === "") return false;
  const na = Number(a);
  const nb = Number(b);
  return Number.isFinite(na) && Number.isFinite(nb) && na === nb;
}

/**
 * کلیدهای اقتصادی که در این ذخیره تغییر می‌کنند در حالی که قفل‌اند.
 * - در REGISTRATION همیشه آرایهٔ خالی برمی‌گرداند.
 * - کلیدی که در `after` نیامده باشد «بدون تغییر» حساب می‌شود.
 * - ارسال دوبارهٔ همان مقدار فعلی (فرم همهٔ فیلدها را می‌فرستد) تغییر حساب نمی‌شود.
 */
export function lockedSettingChanges(
  phase: Phase,
  before: Readonly<Record<string, string | number | undefined>>,
  after: Readonly<Record<string, string | number | undefined>>
): LockedSettingKey[] {
  if (!areEconomySettingsLocked(phase)) return [];
  const changed: LockedSettingKey[] = [];
  for (const key of LOCKED_AFTER_START_KEYS) {
    const next = after[key];
    if (next === undefined) continue;
    if (!sameValue(before[key], next)) changed.push(key);
  }
  return changed;
}

/** حذف کلیدهای قفل‌شده از دادهٔ ذخیره (وقتی قفل‌اند، مقدار فعلی دیتابیس دست‌نخورده می‌ماند) */
export function withoutLockedKeys<V>(phase: Phase, data: Readonly<Record<string, V>>): Record<string, V> {
  if (!areEconomySettingsLocked(phase)) return { ...data };
  const out: Record<string, V> = {};
  for (const key of Object.keys(data)) {
    if (!isLockedSettingKey(key)) out[key] = data[key];
  }
  return out;
}
