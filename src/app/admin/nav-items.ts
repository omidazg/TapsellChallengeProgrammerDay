/**
 * فهرست بخش‌های پنل برگزارکننده — منبع واحد برای ناوبری کناری (AdminNav) و کارت‌های داشبورد.
 * بدون وابستگی سروری است تا در کامپوننت کلاینت هم قابل استفاده باشد.
 */
export type AdminNavItem = { href: string; label: string; emoji: string };

export const ADMIN_SECTIONS: AdminNavItem[] = [
  { href: "/admin", label: "داشبورد", emoji: "🎛️" },
  { href: "/admin/users", label: "کاربران", emoji: "🧑‍💻" },
  { href: "/admin/teams", label: "تیم‌ها", emoji: "👥" },
  { href: "/admin/whitelist", label: "لیست سفید و درخواست‌ها", emoji: "✅" },
  { href: "/admin/auction", label: "حراج زنده", emoji: "🔨" },
  { href: "/admin/jury", label: "هیئت داوران", emoji: "🧑‍⚖️" },
  { href: "/admin/settlement", label: "تسویهٔ نهایی", emoji: "🧾" },
  { href: "/admin/announcements", label: "اطلاعیه‌ها", emoji: "📢" },
  { href: "/admin/flags", label: "پرچم‌های تخلف", emoji: "🚩" },
  { href: "/admin/audit", label: "گزارش کارهای ادمین", emoji: "🗂️" },
  { href: "/admin/analytics", label: "داشبورد تحلیلی", emoji: "📊" },
  { href: "/admin/export", label: "خروجی گزارش‌ها", emoji: "📤" },
];

/** پیوندهای بیرون از پنل که برای برگزارکننده مفیدند (نمای پروژکتور). */
export const ADMIN_EXTRA_LINKS: AdminNavItem[] = [{ href: "/hall", label: "نمای سالن (پروژکتور)", emoji: "📽️" }];

/** داشبورد (/admin) فقط با خودش فعال است؛ بقیه با زیرمسیرهایشان هم فعال می‌شوند. */
export function isAdminNavActive(path: string, href: string) {
  if (href === "/admin") return path === "/admin";
  return path === href || path.startsWith(href + "/");
}
