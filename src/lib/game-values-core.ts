import { DEFAULTS } from "./constants";

/**
 * مقادیر «مؤثر» بازی: همان شکل DEFAULTS، اما کلیدهایی که برگزارکننده در پنل تنظیم می‌کند
 * (و پس از شروع بازی قفل می‌شوند) از جدول Setting خوانده می‌شوند.
 *
 * این ماژول عمداً بدون وابستگی به دیتابیس است تا هم در کامپوننت‌های کلاینت و هم در تست قابل استفاده باشد.
 * خواندن از دیتابیس در ./game-values.ts (فقط سرور) انجام می‌شود.
 */
export type GameValues = typeof DEFAULTS;

/** نگاشت کلید جدول Setting ← فیلد DEFAULTS، با نوع تجزیه (هم‌راستا با getSettingInt/getSettingFloat موتور بازی) */
export const GAME_VALUE_SETTINGS = {
  starting_coins: { field: "startingCoins", kind: "int" },
  support_cap: { field: "supportCap", kind: "int" },
  solo_boost_pct: { field: "soloBoostPct", kind: "int" },
  duo_boost_pct: { field: "duoBoostPct", kind: "int" },
  max_bought_coins_per_user: { field: "maxBoughtCoinsPerUser", kind: "int" },
  bid_increment: { field: "bidIncrement", kind: "int" },
  auction_duration_sec: { field: "auctionDurationSec", kind: "int" },
  adslot_price_banner: { field: "adslotPriceBanner", kind: "int" },
  adslot_price_featured: { field: "adslotPriceFeatured", kind: "int" },
  adslot_price_push: { field: "adslotPricePush", kind: "int" },
  adslot_max_per_team: { field: "adslotMaxPerTeam", kind: "int" },
} as const satisfies Record<string, { field: keyof GameValues; kind: "int" | "float" }>;

export type GameValueSettingKey = keyof typeof GAME_VALUE_SETTINGS;

/**
 * ادغام ردیف‌های خام Setting روی DEFAULTS.
 * مقدار غایب، خالی یا نامعتبر به پیش‌فرض برمی‌گردد (دقیقاً مثل getSettingInt/getSettingFloat).
 */
export function mergeGameValues(raw: Readonly<Record<string, string | null | undefined>>): GameValues {
  const out: GameValues = { ...DEFAULTS };
  for (const key of Object.keys(GAME_VALUE_SETTINGS) as GameValueSettingKey[]) {
    const { field, kind } = GAME_VALUE_SETTINGS[key];
    const value = raw[key];
    if (value == null) continue;
    const n = kind === "int" ? parseInt(value, 10) : parseFloat(value);
    if (Number.isFinite(n)) out[field] = n;
  }
  return out;
}
