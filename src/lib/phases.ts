/** ثابت‌های فاز — بدون وابستگی به دیتابیس (قابل استفاده در کامپوننت‌های کلاینت) */

export const PHASES = [
  "REGISTRATION",
  "IDEATION",
  "SEED_ROUND",
  "BUILD",
  "MARKET",
  "AUCTION",
  "CLOSED",
] as const;
export type Phase = (typeof PHASES)[number];

export const PHASE_LABEL: Record<Phase, string> = {
  REGISTRATION: "ثبت‌نام و تیم",
  IDEATION: "اتاق ایده",
  SEED_ROUND: "دور سرمایه‌گذاری",
  BUILD: "ساخت محصول",
  MARKET: "روز بازار",
  AUCTION: "حراج زنده",
  CLOSED: "پایان بازی",
};

export const PHASE_DESC: Record<Phase, string> = {
  REGISTRATION: "شخصیتت را بساز، تیم سه‌نفره‌ات را کامل کن.",
  IDEATION: "۲۴ ساعت وقت داری ایده‌ات را ثبت کنی و سرمایه بخواهی.",
  SEED_ROUND: "با کیف بذر روی ایده‌های تیم‌های دیگر سرمایه‌گذاری کن.",
  BUILD: "۴۸ ساعت: محصول، تیزر، تصاویر و صفحهٔ محصول.",
  MARKET: "با کیف خرید از تیم‌های دیگر بخر و قلب بده.",
  AUCTION: "نسخه‌های ویژه زنده حراج می‌شوند.",
  CLOSED: "سودها پرداخت شد. نتایج را ببین.",
};

export function phaseIndex(p: Phase) {
  return PHASES.indexOf(p);
}

/** آیا فاز جاری حداقل به فاز داده‌شده رسیده است */
export function phaseAtLeast(current: Phase, target: Phase) {
  return phaseIndex(current) >= phaseIndex(target);
}
