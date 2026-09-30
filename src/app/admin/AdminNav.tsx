"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { fa } from "@/lib/persian";
import { ADMIN_SECTIONS, ADMIN_EXTRA_LINKS, isAdminNavActive } from "./nav-items";

/**
 * ناوبری ماندگار پنل برگزارکننده:
 * دسکتاپ (lg+) نوار کناری چسبان؛ موبایل/تبلت نوار تب افقی اسکرول‌شونده زیر هدر.
 * `badges` شمار موارد منتظر اقدام هر بخش است (مثلاً درخواست‌های دسترسی تازه).
 */
export function AdminNav({ badges = {} }: { badges?: Record<string, number> }) {
  const path = usePathname() ?? "";
  const tabsRef = useRef<HTMLUListElement>(null);

  // در تب‌بار افقی موبایل، تب فعال (که ممکن است بیرون از دید باشد) به دید آورده می‌شود.
  useEffect(() => {
    const active = tabsRef.current?.querySelector<HTMLElement>('[aria-current="page"]');
    active?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [path]);

  return (
    // خود <nav> در موبایل چسبان است (والدش کل ستون پنل است)؛ در دسکتاپ ستونی کشیده در ردیف flex
    // است و نوار کناری درونش چسبان می‌شود.
    <nav aria-label="بخش‌های پنل برگزارکننده" className="sticky top-14 sm:top-16 z-30 lg:static lg:z-auto lg:w-60 lg:shrink-0">
      {/* موبایل/تبلت: تب‌بار افقی زیر هدر چسبان AppShell */}
      <div className="lg:hidden border-b border-brand-mist bg-white/90 backdrop-blur">
        <ul ref={tabsRef} className="flex items-center gap-1 overflow-x-auto no-scrollbar px-3 py-2">
          {ADMIN_SECTIONS.map((s) => {
            const active = isAdminNavActive(path, s.href);
            const badge = badges[s.href] ?? 0;
            return (
              <li key={s.href} className="shrink-0">
                <Link
                  href={s.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-1.5 rounded-pill px-3.5 min-h-10 text-sm font-bold whitespace-nowrap transition ${
                    active ? "bg-brand-navy text-white" : "text-brand-navy hover:bg-brand-ice"
                  }`}
                >
                  <span aria-hidden>{s.emoji}</span>
                  {s.label}
                  {badge > 0 && (
                    <span className="chip-red !px-1.5 !py-0 fa-num" aria-label={`${fa(badge)} مورد در انتظار`}>
                      {fa(badge)}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>

      {/* دسکتاپ: نوار کناری چسبان (زیر هدر دو ردیفهٔ AppShell) */}
      <div className="hidden lg:block sticky top-28 max-h-[calc(100vh-8rem)] overflow-y-auto py-8">
        <div className="card p-2">
          <ul className="space-y-0.5">
            {ADMIN_SECTIONS.map((s) => {
              const active = isAdminNavActive(path, s.href);
              const badge = badges[s.href] ?? 0;
              return (
                <li key={s.href}>
                  <Link
                    href={s.href}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-2.5 rounded-2xl px-3 min-h-10 text-sm font-bold transition ${
                      active ? "bg-brand-navy text-white" : "text-brand-navy hover:bg-brand-ice"
                    }`}
                  >
                    <span aria-hidden className="w-5 text-center">{s.emoji}</span>
                    <span className="flex-1 min-w-0 truncate">{s.label}</span>
                    {badge > 0 && (
                      <span className="chip-red !px-1.5 !py-0 fa-num" aria-label={`${fa(badge)} مورد در انتظار`}>
                        {fa(badge)}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="my-2 border-t border-brand-mist" />
          <ul>
            {ADMIN_EXTRA_LINKS.map((s) => (
              <li key={s.href}>
                <Link
                  href={s.href}
                  className="flex items-center gap-2.5 rounded-2xl px-3 min-h-10 text-sm font-bold text-brand-slate hover:bg-brand-ice"
                >
                  <span aria-hidden className="w-5 text-center">{s.emoji}</span>
                  {s.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </nav>
  );
}
