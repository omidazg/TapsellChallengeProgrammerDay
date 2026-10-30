/**
 * فهرست بخش‌های پنل برگزارکننده — منبع واحد برای ناوبری کناری (AdminNav) و کارت‌های داشبورد.
 * بدون وابستگی سروری است تا در کامپوننت کلاینت هم قابل استفاده باشد.
 * این فهرست فقط پیوندها را تعیین می‌کند؛ دسترسی واقعی را هر صفحه و اکشن روی سرور بررسی می‌کند.
 */
import type { PanelRole } from "@/lib/panel-roles";

export type AdminNavItem = {
  href: string;
  label: string;
  emoji: string;
  /** نقش‌های محدودی که این بخش را می‌بینند؛ ادمین کامل همیشه می‌بیند. */
  staff?: PanelRole[];
};

export const ADMIN_SECTIONS: AdminNavItem[] = [
  { href: "/admin", label: "داشبورد", emoji: "🎛️" },
  { href: "/admin/control", label: "مرکز کنترل", emoji: "🕹️" },
  { href: "/admin/tracks", label: "محورها و وزن‌ها", emoji: "🧭" },
  { href: "/admin/prizes", label: "جوایز", emoji: "🏆" },
  { href: "/admin/os-issues", label: "ایشوهای OS", emoji: "🧩" },
  { href: "/admin/users", label: "کاربران", emoji: "🧑‍💻" },
  { href: "/admin/staff", label: "داوران و اپراتورها", emoji: "🪪" },
  { href: "/admin/teams", label: "تیم‌ها", emoji: "👥" },
  { href: "/admin/whitelist", label: "لیست سفید و درخواست‌ها", emoji: "✅" },
  { href: "/admin/coins", label: "سکه و پرداخت", emoji: "🪙" },
  { href: "/admin/auction", label: "حراج و جایگاه تبلیغاتی", emoji: "🔨" },
  { href: "/admin/studio", label: "درخواست‌های انتشار", emoji: "🚀", staff: ["STUDIO_OP"] },
  { href: "/admin/bazaar", label: "آمار بازار", emoji: "📈", staff: ["STUDIO_OP"] },
  { href: "/admin/jury", label: "داوری", emoji: "🧑‍⚖️", staff: ["JUDGE"] },
  { href: "/admin/settlement", label: "تسویهٔ نهایی", emoji: "🧾" },
  { href: "/admin/announcements", label: "اطلاعیه‌ها", emoji: "📢" },
  { href: "/admin/flags", label: "پرچم‌های تخلف", emoji: "🚩" },
  { href: "/admin/audit", label: "گزارش کارهای ادمین", emoji: "🗂️" },
  { href: "/admin/analytics", label: "داشبورد تحلیلی", emoji: "📊" },
  { href: "/admin/export", label: "خروجی گزارش‌ها", emoji: "📤" },
];

/** پیوندهای بیرون از پنل که برای برگزارکننده مفیدند (نمای پروژکتور). */
export const ADMIN_EXTRA_LINKS: AdminNavItem[] = [{ href: "/hall", label: "نمای سالن (پروژکتور)", emoji: "📽️" }];

/** بخش‌هایی که این نقش در ناوبری می‌بیند */
export function adminSectionsFor(role: PanelRole): AdminNavItem[] {
  return role === "ADMIN" ? ADMIN_SECTIONS : ADMIN_SECTIONS.filter((s) => s.staff?.includes(role));
}

/** پیوندهای بیرونی این نقش */
export function adminExtraLinksFor(role: PanelRole): AdminNavItem[] {
  return role === "ADMIN" ? ADMIN_EXTRA_LINKS : [];
}

/** داشبورد (/admin) فقط با خودش فعال است؛ بقیه با زیرمسیرهایشان هم فعال می‌شوند. */
export function isAdminNavActive(path: string, href: string) {
  if (href === "/admin") return path === "/admin";
  return path === href || path.startsWith(href + "/");
}
