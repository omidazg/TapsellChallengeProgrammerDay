"use client";

import Link from "next/link";
import type { Phase } from "@/lib/phases";
import { NAV, isActive, navState, phaseDestination, type NavItem } from "./NavConfig";

/** نشانهٔ فازی کنار آیتم منو: نقطهٔ تپندهٔ «زنده» برای فاز جاری یا قفل برای فازهای نرسیده */
export function NavPhaseMark({ live, lockHint }: { live: boolean; lockHint: string | null }) {
  if (live) {
    return (
      <>
        <span aria-hidden className="nav-live-dot shrink-0" />
        <span className="sr-only">(فاز جاری)</span>
      </>
    );
  }
  if (lockHint) {
    return (
      <>
        <span aria-hidden className="shrink-0 text-[0.75em] leading-none">🔒</span>
        <span className="sr-only">({lockHint})</span>
      </>
    );
  }
  return null;
}

const HOME: NavItem = { href: "/", label: "خانه", icon: "🏠" };
// از NAV برداشته می‌شوند تا فاز «زنده»شان (مثلاً اتاق تیم در ثبت‌نام) هم‌خوان بماند
const TEAM = NAV.find((n) => n.href === "/team")!;
const BOARD = NAV.find((n) => n.href === "/leaderboard")!;

/**
 * نوار زبانه‌های پایین برای موبایل/تبلت (زیر lg، همان نقطه‌ای که منوی همبرگری ظاهر می‌شود).
 * ارتفاعش در متغیر CSS ‏`--bottom-nav-h` (globals.css) منتشر می‌شود تا محتوا و دکمه‌های
 * شناور (با کلاس `.above-bottom-nav`) زیرش پنهان نشوند.
 */
export function NavBottomBar({
  path,
  phase,
  menuOpen,
  onMore,
}: {
  path: string;
  phase: Phase;
  menuOpen: boolean;
  onMore: (button: HTMLButtonElement) => void;
}) {
  const phaseItem = phaseDestination(phase);
  // برچسب کامل برای جایگاه‌های ثابت؛ برای جایگاه فاز نسخهٔ کوتاه تا در یک‌پنجم عرض جا شود
  const items = [
    { ...HOME, text: HOME.label },
    { ...TEAM, text: TEAM.label },
    { ...phaseItem, text: phaseItem.short ?? phaseItem.label },
    { ...BOARD, text: BOARD.label },
  ];
  const anyActive = items.some((n) => isActive(path, n.href));

  return (
    <nav aria-label="ناوبری سریع" className="nav-bottom-bar lg:hidden print:hidden fixed inset-x-0 bottom-0 z-40 border-t border-brand-mist bg-white/90 backdrop-blur">
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {items.map((n) => {
          const active = isActive(path, n.href);
          const { live } = navState(n, phase);
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
                  {live && <span className="nav-live-dot absolute -top-0.5 -left-0.5" />}
                </span>
                <span className="max-w-full truncate px-1">{n.text}</span>
                {live && <span className="sr-only">(فاز جاری)</span>}
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
