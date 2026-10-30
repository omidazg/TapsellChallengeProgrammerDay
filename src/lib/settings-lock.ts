/**
 * قفل تنظیمات اقتصادی بازی پس از شروع.
 * قوانین اقتصادی (سکهٔ اولیه، سقف اثر حمایت، قیمت‌ها و گام حراج) باید پیش از شروع بازی ثابت و شفاف باشند؛
 * از اولین خرج سکه (حمایت، خرید، حراج یا جایگاه) دیگر برگزارکننده نمی‌تواند آن‌ها را تغییر دهد.
 * کلیدهای عملیاتی (زمان‌بندی/لجستیک) مثل market_starts_at و auction_duration_sec
 * و همهٔ تنظیمات زمان‌بند خودکار همچنان قابل‌تغییر می‌مانند.
 *
 * این ماژول عمداً بدون وابستگی به دیتابیس است تا هم در سرور و هم در تست قابل استفاده باشد.
 */

/** کلیدهای اقتصادی که پس از شروع بازی قفل می‌شوند */
export const LOCKED_AFTER_START_KEYS = [
  "starting_coins",
  "support_cap",
  "max_bought_coins_per_user",
  "bid_increment",
  "adslot_price_banner",
  "adslot_price_featured",
  "adslot_price_push",
  "adslot_max_per_team",
] as const;
export type LockedSettingKey = (typeof LOCKED_AFTER_START_KEYS)[number];

export function isLockedSettingKey(key: string): key is LockedSettingKey {
  return (LOCKED_AFTER_START_KEYS as readonly string[]).includes(key);
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
 * - اگر قفل نباشد همیشه آرایهٔ خالی برمی‌گرداند.
 * - کلیدی که در `after` نیامده باشد «بدون تغییر» حساب می‌شود.
 * - ارسال دوبارهٔ همان مقدار فعلی (فرم همهٔ فیلدها را می‌فرستد) تغییر حساب نمی‌شود.
 */
export function lockedSettingChanges(
  locked: boolean,
  before: Readonly<Record<string, string | number | undefined>>,
  after: Readonly<Record<string, string | number | undefined>>
): LockedSettingKey[] {
  if (!locked) return [];
  const changed: LockedSettingKey[] = [];
  for (const key of LOCKED_AFTER_START_KEYS) {
    const next = after[key];
    if (next === undefined) continue;
    if (!sameValue(before[key], next)) changed.push(key);
  }
  return changed;
}

/** حذف کلیدهای قفل‌شده از دادهٔ ذخیره (وقتی قفل‌اند، مقدار فعلی دیتابیس دست‌نخورده می‌ماند) */
export function withoutLockedKeys<V>(locked: boolean, data: Readonly<Record<string, V>>): Record<string, V> {
  if (!locked) return { ...data };
  const out: Record<string, V> = {};
  for (const key of Object.keys(data)) {
    if (!isLockedSettingKey(key)) out[key] = data[key];
  }
  return out;
}
