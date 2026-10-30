import { statusVisible, type ModuleKey, type ModuleStatus } from "@/lib/modules";

export type ModuleStatuses = Record<ModuleKey, ModuleStatus>;

/** یک مقصد منو. `module`: بخشی که این صفحه به آن وابسته است؛ بخش مخفی لینک را از منو برمی‌دارد. */
export type NavItem = { href: string; label: string; short?: string; icon: string; module?: ModuleKey };

export const NAV: NavItem[] = [
  { href: "/team", label: "اتاق تیم", short: "تیم", icon: "👥", module: "team" },
  { href: "/idea", label: "ثبت ایده", short: "ایده", icon: "💡", module: "idea" },
  { href: "/invest", label: "حمایت از ایده‌ها", short: "حمایت", icon: "🌱", module: "invest" },
  { href: "/build", label: "مرکز ساخت", short: "ساخت", icon: "🛠️", module: "build" },
  { href: "/market", label: "بازار", icon: "🛒", module: "market" },
  // حراج زنده بخشی از بازار است و وضعیت جدا ندارد.
  { href: "/auction", label: "حراج زنده", short: "حراج", icon: "🔨", module: "market" },
  { href: "/adslots", label: "جایگاه تبلیغاتی", short: "تبلیغ", icon: "📣", module: "adslots" },
  { href: "/leaderboard", label: "جدول", icon: "🏆", module: "leaderboard" },
  { href: "/results", label: "نتایج", icon: "🏁", module: "results" },
  { href: "/guide", label: "راهنما", icon: "📖" },
];

/** کیف سکه و خرید سکه — در منوی موبایل (روی دسکتاپ از نشان موجودی در هدر در دسترس‌اند) */
export const WALLET_ITEMS: NavItem[] = [
  { href: "/wallet", label: "کیف سکه", icon: "💰" },
  { href: "/coins", label: "خرید سکه", icon: "🪙", module: "coins" },
];

/** آیتم‌هایی که بخششان مخفی نیست */
export function visibleItems(items: NavItem[], statuses: ModuleStatuses): NavItem[] {
  return items.filter((n) => !n.module || statusVisible(statuses[n.module]));
}

/** منوی اصلی بر اساس وضعیت بخش‌ها */
export function navFor(statuses: ModuleStatuses): NavItem[] {
  return visibleItems(NAV, statuses);
}

export function isActive(path: string, href: string) {
  if (href === "/") return path === "/";
  return path === href || path.startsWith(href + "/");
}
