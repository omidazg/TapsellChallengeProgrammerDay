/**
 * بخش‌های مسابقه و وضعیت هر کدام — بدون وابستگی به دیتابیس (قابل استفاده در کلاینت).
 * ادمین وضعیت هر بخش را دستی در «مرکز کنترل» عوض می‌کند؛ پیاده‌سازی سمت سرور در ./module-state.ts است.
 */
export const MODULE_KEYS = [
  "registration",
  "team",
  "idea",
  "invest",
  "build",
  "studio",
  "market",
  "adslots",
  "coins",
  "ai",
  "jury",
  "leaderboard",
  "results",
] as const;
export type ModuleKey = (typeof MODULE_KEYS)[number];

export const MODULE_STATUSES = ["open", "ro", "closed", "hidden"] as const;
export type ModuleStatus = (typeof MODULE_STATUSES)[number];

export const MODULE_STATUS_LABEL: Record<ModuleStatus, string> = {
  open: "باز",
  ro: "فقط‌خواندنی",
  closed: "بسته",
  hidden: "مخفی",
};

export const MODULE_LABEL: Record<ModuleKey, string> = {
  registration: "ثبت‌نام",
  team: "تشکیل و تغییر تیم",
  idea: "ثبت و ویرایش ایده",
  invest: "حمایت با سکه از ایده‌ها",
  build: "ساخت و ثبت محصول",
  studio: "درخواست انتشار روی بازار استودیو",
  market: "بازار و حراج زنده",
  adslots: "حراج جایگاه تبلیغاتی",
  coins: "خرید سکه با پول",
  ai: "ارزیابی هوش مصنوعی",
  jury: "داوری نهایی (پنل داوران)",
  leaderboard: "جدول امتیاز",
  results: "نتایج و برندگان",
};

export const MODULE_DEFAULTS: Record<ModuleKey, ModuleStatus> = {
  registration: "open",
  team: "open",
  idea: "open",
  invest: "open",
  build: "open",
  studio: "open",
  market: "open",
  adslots: "open",
  coins: "open",
  ai: "open",
  jury: "closed",
  leaderboard: "ro",
  results: "hidden",
};

/** بخش‌هایی که پایان مسابقه آن‌ها را فقط‌خواندنی می‌کند (داوری، ارزیابی و نتایج بعد از ددلاین ادامه دارند). */
export const MODULES_FROZEN_AT_END: readonly ModuleKey[] = [
  "registration",
  "team",
  "idea",
  "invest",
  "build",
  "studio",
  "market",
  "adslots",
  "coins",
];

/** آیا این وضعیت اجازهٔ دیدن بخش را می‌دهد؟ */
export function statusVisible(status: ModuleStatus): boolean {
  return status === "open" || status === "ro";
}

export function isModuleStatus(v: unknown): v is ModuleStatus {
  return (MODULE_STATUSES as readonly unknown[]).includes(v);
}

/** منبع آمار بازار استودیو */
export const BAZAAR_SOURCES = ["manual", "api", "off"] as const;
export type BazaarSource = (typeof BAZAAR_SOURCES)[number];
export const BAZAAR_SOURCE_LABEL: Record<BazaarSource, string> = {
  manual: "ورود دستی / اکسل",
  api: "API بازار استودیو",
  off: "غیرفعال",
};
