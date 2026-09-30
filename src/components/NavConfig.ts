import { PHASE_LABEL, phaseIndex, type Phase } from "@/lib/phases";

/** یک مقصد منو. `opens`: فازی که صفحه از آن باز می‌شود؛ `live`: فازی که این صفحه مقصد اصلی آن است. */
export type NavItem = { href: string; label: string; short?: string; icon: string; opens?: Phase; live?: Phase };

// فاز بازشدن هر صفحه با شرط Locked خودِ همان صفحه هم‌خوان است (idea/build از IDEATION،
// invest از SEED_ROUND، market و adslots از BUILD، auction از AUCTION).
export const NAV: NavItem[] = [
  { href: "/team", label: "اتاق تیم", short: "تیم", icon: "👥", live: "REGISTRATION" },
  { href: "/idea", label: "اتاق ایده", short: "ایده", icon: "💡", opens: "IDEATION", live: "IDEATION" },
  { href: "/invest", label: "سرمایه‌گذاری", short: "سرمایه", icon: "🌱", opens: "SEED_ROUND", live: "SEED_ROUND" },
  { href: "/build", label: "مرکز ساخت", short: "ساخت", icon: "🛠️", opens: "IDEATION", live: "BUILD" },
  { href: "/market", label: "بازار", icon: "🛒", opens: "BUILD", live: "MARKET" },
  { href: "/auction", label: "حراج زنده", short: "حراج", icon: "🔨", opens: "AUCTION", live: "AUCTION" },
  { href: "/adslots", label: "جایگاه تبلیغاتی", short: "تبلیغ", icon: "📣", opens: "BUILD" },
  { href: "/leaderboard", label: "جدول", icon: "🏆" },
  { href: "/guide", label: "راهنما", icon: "📖" },
];

const RESULTS: NavItem = { href: "/results", label: "نتایج", icon: "🏁", live: "CLOSED" };
const GUIDE = NAV.find((n) => n.href === "/guide")!;

// بعد از پایان بازی، صفحهٔ نتایج مهم‌ترین مقصد است و باید از منو در دسترس باشد
export function navFor(phase: Phase): NavItem[] {
  return phase === "CLOSED" ? [...NAV, RESULTS] : NAV;
}

export function isActive(path: string, href: string) {
  if (href === "/") return path === "/";
  return path === href || path.startsWith(href + "/");
}

/** وضعیت فازی یک آیتم: «زنده» (مقصد فاز جاری) یا «قفل» (فازش هنوز نرسیده) */
export function navState(item: NavItem, phase: Phase): { live: boolean; locked: boolean; lockHint: string | null } {
  const locked = !!item.opens && phaseIndex(phase) < phaseIndex(item.opens);
  return {
    live: item.live === phase,
    locked,
    lockHint: locked && item.opens ? `از فاز «${PHASE_LABEL[item.opens]}» باز می‌شود` : null,
  };
}

/**
 * مقصد اصلی فاز جاری برای نوار پایین موبایل. «اتاق تیم» خودش جایگاه ثابت دارد،
 * پس در فاز ثبت‌نام به‌جایش راهنما نشان داده می‌شود.
 */
export function phaseDestination(phase: Phase): NavItem {
  const item = navFor(phase).find((n) => n.live === phase);
  return item && item.href !== "/team" ? item : GUIDE;
}
