"use client";

import Link from "next/link";
import { isActive, navFor, type ModuleStatuses, type NavItem } from "./NavConfig";

const HOME: NavItem = { href: "/", label: "خانه", icon: "🏠" };
// ترتیب اولویت جایگاه‌های نوار پایین؛ بخش‌های مخفی کنار می‌روند و نفر بعدی جایشان می‌آید.
const PRIORITY = ["/team", "/build", "/leaderboard", "/market", "/idea", "/invest", "/guide"];
const BAR_ITEMS = 3;

/**
 * نوار زبانه‌های پایین برای موبایل/تبلت (زیر lg، همان نقطه‌ای که منوی همبرگری ظاهر می‌شود).
 * ارتفاعش در متغیر CSS ‏`--bottom-nav-h` (globals.css) منتشر می‌شود تا محتوا و دکمه‌های
 * شناور (با کلاس `.above-bottom-nav`) زیرش پنهان نشوند.
 */
export function NavBottomBar({
  path,
  modules,
  menuOpen,
  onMore,
}: {
  path: string;
  modules: ModuleStatuses;
  menuOpen: boolean;
  onMore: (button: HTMLButtonElement) => void;
}) {
  const nav = navFor(modules);
  const picks = PRIORITY.map((href) => nav.find((n) => n.href === href))
    .filter((n): n is NavItem => !!n)
    .slice(0, BAR_ITEMS);
  // برچسب کوتاه تا در یک‌پنجم عرض جا شود؛ «اتاق تیم» و «جدول» با برچسب کامل هم جا می‌شوند
  const items = [HOME, ...picks].map((n) => ({ ...n, text: n.href === "/team" ? n.label : (n.short ?? n.label) }));
  const anyActive = items.some((n) => isActive(path, n.href));

  return (
    <nav aria-label="ناوبری سریع" className="nav-bottom-bar lg:hidden print:hidden fixed inset-x-0 bottom-0 z-40 border-t border-brand-mist bg-white/90 backdrop-blur">
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {items.map((n) => {
          const active = isActive(path, n.href);
          return (
            <li key={n.href}>
              <Link
                href={n.href}
                title={n.label}
                aria-current={active ? "page" : undefined}
                className={`nav-bottom-item ${active ? "text-brand-navy" : "text-brand-slate hover:text-brand-navy"}`}
              >
                <span aria-hidden className={`nav-bottom-icon ${active ? "bg-brand-mist" : ""}`}>
                  {n.icon}
                </span>
                <span className="max-w-full truncate px-1">{n.text}</span>
              </Link>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            onClick={(e) => onMore(e.currentTarget)}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            className={`nav-bottom-item w-full ${menuOpen || !anyActive ? "text-brand-navy" : "text-brand-slate hover:text-brand-navy"}`}
          >
            <span aria-hidden className={`nav-bottom-icon ${menuOpen ? "bg-brand-mist" : ""}`}>
              {menuOpen ? "✕" : "☰"}
            </span>
            <span>{menuOpen ? "بستن" : "بیشتر"}</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}
