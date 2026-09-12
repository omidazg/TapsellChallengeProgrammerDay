/**
 * فهرست دپارتمان‌ها در ماژول ساده (نه "use server").
 * ماژول "use server" فقط اجازهٔ export تابع async دارد؛
 * هر export دیگری در کلاینت undefined می‌شود.
 */
export const DEPARTMENTS = [
  "بک‌اند",
  "فرانت‌اند",
  "موبایل",
  "دیتا",
  "محصول",
  "طراحی",
  "فروش",
  "مارکتینگ",
  "منابع انسانی",
  "مالی",
  "سایر",
] as const;

export type Department = (typeof DEPARTMENTS)[number];
