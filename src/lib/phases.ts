/**
 * وضعیت کلی مسابقه — بدون وابستگی به دیتابیس (قابل استفاده در کامپوننت‌های کلاینت).
 * مرحلهٔ سراسری دیگر وجود ندارد: مسابقه یا در جریان است یا تمام شده، و هر بخش وضعیت خودش را
 * دارد (./modules.ts). تنها زمان‌بندی باقی‌مانده ددلاین نهایی است که مسابقه را خودکار می‌بندد.
 */
export const PHASES = ["LIVE", "CLOSED"] as const;
export type Phase = (typeof PHASES)[number];

export const PHASE_LABEL: Record<Phase, string> = {
  LIVE: "مسابقه در جریان است",
  CLOSED: "پایان مسابقه",
};

export const PHASE_DESC: Record<Phase, string> = {
  LIVE: "همهٔ مراحل باز است؛ هر تیم با سرعت خودش جلو می‌رود.",
  CLOSED: "مسابقه تمام شد. نتایج را ببین.",
};

export function phaseIndex(p: Phase) {
  return PHASES.indexOf(p);
}

/** آیا وضعیت جاری حداقل به وضعیت داده‌شده رسیده است */
export function phaseAtLeast(current: Phase, target: Phase) {
  return phaseIndex(current) >= phaseIndex(target);
}
