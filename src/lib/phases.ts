/** ثابت‌های فاز — بدون وابستگی به دیتابیس (قابل استفاده در کامپوننت‌های کلاینت) */

export const PHASES = [
  "REGISTRATION",
  "IDEATION",
  "SEED_ROUND",
  "BUILD",
  "MARKET",
  "CLOSED",
] as const;
export type Phase = (typeof PHASES)[number];

export const PHASE_LABEL: Record<Phase, string> = {
  REGISTRATION: "ثبت‌نام و تیم",
  IDEATION: "اتاق ایده",
  SEED_ROUND: "دور حمایت",
  BUILD: "ساخت محصول",
  MARKET: "روز بازار",
  CLOSED: "پایان بازی",
};

export const PHASE_DESC: Record<Phase, string> = {
  REGISTRATION: "ثبت‌نام کن؛ تنها یا با یک تا دو هم‌تیمی.",
  IDEATION: "ایده‌ات را ثبت کن.",
  SEED_ROUND: "با سکه‌هایت از ایده‌های دیگران حمایت کن.",
  BUILD: "محصول، تیزر و صفحهٔ محصول را بساز.",
  MARKET: "از محصولات دیگران بخر، در حراج زنده شرکت کن و محصولت را به حراج بفرست.",
  CLOSED: "بازی تمام شد. نتایج را ببین.",
};

export function phaseIndex(p: Phase) {
  return PHASES.indexOf(p);
}

/** آیا فاز جاری حداقل به فاز داده‌شده رسیده است */
export function phaseAtLeast(current: Phase, target: Phase) {
  return phaseIndex(current) >= phaseIndex(target);
}
