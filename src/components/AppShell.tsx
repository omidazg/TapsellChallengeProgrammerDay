"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { PHASE_LABEL, type Phase } from "@/lib/phases";
import { fa, duration } from "@/lib/persian";
import { isActive, navFor, navState, type NavItem } from "./NavConfig";
import { NavBottomBar, NavPhaseMark } from "./NavBottomBar";
import { Avatar } from "./Avatar";
import { NotificationBell } from "./NotificationBell";
import { ThemeToggle } from "./ThemeToggle";
import { AskAgent } from "./AskAgent";
import { PushPrompt } from "./PushPrompt";
import { PillarStrip } from "./PillarLogos";
import { GROUP_NAME } from "@/lib/pillars";

type ShellUser = { id: string; nickname: string; isAdmin: boolean; seedWallet: number; buyWallet: number; teamName: string | null; avatarSeed: string };

// فهرست مقصدها، فاز بازشدن و فاز «زنده»ٔ هر آیتم در NavConfig.ts است (مشترک با نوار پایین موبایل).
const EXTRA_MOBILE: NavItem[] = [
  { href: "/wallet", label: "کیف پول", icon: "💰" },
  { href: "/profile", label: "پروفایل", icon: "🙂" },
];
const ADMIN_ITEM: NavItem = { href: "/admin", label: "برگزارکننده", icon: "🎛️" };

export function AppShell({ user, phase, phaseEndsAt, children }: { user: ShellUser | null; phase: Phase; phaseEndsAt: string | null; children: React.ReactNode }) {
  const path = usePathname();
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  // دکمه‌ای که منو را باز کرده (همبرگر هدر یا «بیشتر» نوار پایین) تا فوکوس با Escape به همان برگردد
  const menuOpenerRef = useRef<HTMLButtonElement | null>(null);
  // منو فقط در مسیری که باز شده باز می‌ماند؛ با تغییر مسیر خودبه‌خود بسته می‌شود (بدون effect)
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === path;
  const setOpen = (v: boolean | ((o: boolean) => boolean)) =>
    setOpenAt((prev) => {
      const next = typeof v === "function" ? v(prev === path) : v;
      return next ? path : null;
    });

  // قفل اسکرول پس‌زمینه وقتی منوی موبایل باز است
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // با Escape منوی موبایل بسته می‌شود و فوکوس به دکمهٔ همبرگر برمی‌گردد
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        (menuOpenerRef.current ?? menuButtonRef.current)?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setOpen هر بار از setOpenAt بازساخته می‌شود اما پایدار است
  }, [open]);

  // بنر «نظرسنجی پایان بازی»: فقط وقتی فاز CLOSED است و کاربر هنوز پاسخ نداده.
  // وضعیت به‌جای صفرشدن داخل افکت، از روی user/phase محاسبه می‌شود؛ هم setState همگام
  // داخل افکت (هشدار react-hooks) حذف می‌شود و هم بنر قبل از رسیدن پاسخ سرور پرش نمی‌کند.
  const [surveyAnswered, setSurveyAnswered] = useState<boolean | null>(null);
  useEffect(() => {
    if (!user || phase !== "CLOSED") return;
    let cancelled = false;
    fetch("/survey/status", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d && typeof d.answered === "boolean") setSurveyAnswered(d.answered);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user, phase]);
  const surveyNudge = !!user && phase === "CLOSED" && surveyAnswered === false;

  // نمای سالن (پروژکتور) تمام‌صفحه است و روی همه‌چیز می‌افتد؛ هدر/فوتر زیر آن
  // فقط عناصر فوکوس‌پذیر پنهان می‌سازد. بعد از همهٔ هوک‌ها برمی‌گردیم تا قاعدهٔ هوک‌ها نشکند.
  if (path === "/hall") return <>{children}</>;

  return (
    // pb با --bottom-nav-h: فوتر و انتهای محتوا زیر نوار پایین موبایل پنهان نمی‌شوند (روی دسکتاپ صفر است)
    <div className="min-h-screen flex flex-col pb-[var(--bottom-nav-h,0px)]">
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-brand-mist">
        {/* ردیف اول: لوگو + وضعیت + کاربر */}
        <div className="mx-auto max-w-7xl px-3 sm:px-4 h-14 sm:h-16 flex items-center gap-2 sm:gap-4">
          <Link href="/" className="flex items-center gap-2 sm:gap-3 shrink-0" aria-label="صفحهٔ اصلی">
            <Image src="/brand/favicon.svg" alt="" width={32} height={32} priority unoptimized className="size-8 sm:size-9 rounded-xl" />
            <span className="hidden sm:flex flex-col leading-tight">
              <span className="text-sm md:text-base font-black text-brand-navy whitespace-nowrap">میدان بنیان‌گذاران</span>
              <span className="text-[11px] font-bold text-brand-slate whitespace-nowrap">{GROUP_NAME}</span>
            </span>
          </Link>

          <div className="mr-auto flex items-center gap-1.5 sm:gap-2 min-w-0">
            {/* برای مهمان روی موبایل جا تنگ است و خود صفحهٔ فرود فاز را نشان می‌دهد */}
            <span className={user ? "contents" : "hidden sm:contents"}>
              <PhasePill phase={phase} endsAt={phase === "CLOSED" ? null : phaseEndsAt} />
            </span>
            {user ? (
              <>
                <Link href="/wallet" className="hidden md:flex items-center gap-2 rounded-pill bg-brand-ice px-3 py-1.5 text-xs font-bold text-brand-navy hover:bg-brand-mist whitespace-nowrap" title="کیف پول">
                  <span title="کیف بذر">🌱 {fa(user.seedWallet)}</span>
                  <span className="text-brand-slate">|</span>
                  <span title="کیف خرید">🛒 {fa(user.buyWallet)}</span>
                </Link>
                <NotificationBell phase={phase} />
                <ThemeToggle className="hidden lg:inline-flex" />
                <Link href="/profile" className="flex items-center shrink-0" aria-label="پروفایل" title={user.nickname}>
                  <Avatar seed={user.avatarSeed || user.id} size={32} />
                </Link>
                <form action="/logout" method="post" className="hidden lg:block">
                  <button type="submit" className="btn-ghost !py-1.5 !px-3 text-xs" title="خروج از حساب">خروج</button>
                </form>
                <button
                  ref={menuButtonRef}
                  type="button"
                  className="lg:hidden inline-flex items-center justify-center size-10 rounded-full border border-brand-mist text-brand-navy hover:bg-brand-ice shrink-0"
                  onClick={() => {
                    menuOpenerRef.current = menuButtonRef.current;
                    setOpen((o) => !o);
                  }}
                  aria-label={open ? "بستن منو" : "باز کردن منو"}
                  aria-expanded={open}
                  aria-controls="mobile-nav"
                >
                  <span aria-hidden className="text-lg leading-none">{open ? "✕" : "☰"}</span>
                </button>
              </>
            ) : (
              <>
                <ThemeToggle className="hidden sm:inline-flex" />
                <Link href="/guide" className="hidden sm:inline-flex btn-ghost !py-1.5 !px-4">راهنمای بازی</Link>
                <Link href="/login" className="btn-ghost !py-1.5 !px-4">ورود</Link>
                <Link href="/register" className="btn-primary !py-1.5 !px-4">ثبت‌نام</Link>
              </>
            )}
          </div>
        </div>

        {/* ردیف دوم (دسکتاپ): منوی اصلی — همیشه در یک خط، بدون شکستن متن */}
        {user && (
          <nav className="hidden lg:block border-t border-brand-mist/70" aria-label="ناوبری اصلی">
            <div className="mx-auto max-w-7xl px-4 h-11 flex items-center gap-1 overflow-x-auto no-scrollbar">
              {navFor(phase).map((n) => {
                const active = isActive(path, n.href);
                const { live, locked, lockHint } = navState(n, phase);
                return (
                  <Link
                    key={n.href}
                    href={n.href}
                    title={lockHint ?? (live ? "فاز جاری" : undefined)}
                    aria-current={active ? "page" : undefined}
                    className={`inline-flex items-center gap-1.5 rounded-pill px-3.5 py-1.5 text-sm font-bold whitespace-nowrap transition ${active ? "bg-brand-navy text-white" : "text-brand-navy hover:bg-brand-ice"} ${locked && !active ? "opacity-60 hover:opacity-100" : ""}`}
                  >
                    {n.label}
                    <NavPhaseMark live={live} lockHint={lockHint} />
                  </Link>
                );
              })}
              {user.isAdmin && (
                <Link
                  href="/admin"
                  aria-current={isActive(path, "/admin") ? "page" : undefined}
                  className={`mr-auto rounded-pill px-3.5 py-1.5 text-sm font-bold whitespace-nowrap ${isActive(path, "/admin") ? "bg-brand-red text-white" : "text-brand-red hover:bg-red-50"}`}
                >
                  برگزارکننده
                </Link>
              )}
            </div>
          </nav>
        )}

        {/* منوی موبایل/تبلت: کشویی تمام‌عرض */}
        {user && (
          <div id="mobile-nav" hidden={!open} className="lg:hidden">
            <nav
              aria-label="منوی موبایل"
              className="absolute inset-x-0 z-40 border-t border-brand-mist bg-white px-3 py-3 shadow-lift max-h-[calc(100dvh-3.5rem-var(--bottom-nav-h,0px))] overflow-y-auto overscroll-contain"
            >
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {[...navFor(phase), ...EXTRA_MOBILE, ...(user.isAdmin ? [ADMIN_ITEM] : [])].map((n) => {
                  const active = isActive(path, n.href);
                  const { live, locked, lockHint } = navState(n, phase);
                  return (
                    <Link
                      key={n.href}
                      href={n.href}
                      onClick={() => setOpen(false)}
                      title={lockHint ?? undefined}
                      aria-current={active ? "page" : undefined}
                      className={`flex items-center gap-2 rounded-2xl px-3 py-3 text-sm font-bold min-h-12 ${active ? "bg-brand-navy text-white" : n.href === "/admin" ? "bg-red-50 text-brand-red" : "bg-brand-ice text-brand-navy"} ${locked && !active ? "opacity-60" : ""}`}
                    >
                      <span aria-hidden>{n.icon}</span>
                      <span className="truncate">{n.label}</span>
                      <span className="mr-auto inline-flex items-center">
                        <NavPhaseMark live={live} lockHint={lockHint} />
                      </span>
                    </Link>
                  );
                })}
              </div>
              <div className="md:hidden mt-3 flex items-center justify-between rounded-2xl border border-brand-mist px-4 py-2.5 text-xs font-bold text-brand-navy">
                <span>🌱 کیف بذر: {fa(user.seedWallet)}</span>
                <span>🛒 کیف خرید: {fa(user.buyWallet)}</span>
              </div>
              {/* فقط وقتی منو باز است mount می‌شود: وگرنه نسخهٔ دوم زنگ هم هر ۲۰ ثانیه poll می‌کرد */}
              {open && (
                <div className="mt-3">
                  <NotificationBell phase={phase} variant="mobile" />
                </div>
              )}
              <div className="mt-3 flex items-center justify-between rounded-2xl border border-brand-mist px-4 py-2.5">
                <span className="text-xs font-bold text-brand-navy">پوستهٔ نمایش</span>
                <ThemeToggle />
              </div>
              <form action="/logout" method="post" className="mt-3">
                {/* بدون !important: utilityها خودشان بر btn-ghost (لایهٔ components) غلبه می‌کنند و
                    این‌طور بازنویسی حالت تیرهٔ theme.css (رنگ قرمز روشن‌تر) هم به آن می‌رسد */}
                <button type="submit" className="btn-ghost w-full text-brand-red border-red-100 hover:bg-red-50">🚪 خروج از حساب</button>
              </form>
            </nav>
          </div>
        )}
      </header>
      {/* پس‌زمینهٔ تیرهٔ منوی موبایل — بیرون از header، چون backdrop-blur عناصر fixed داخلش را محصور می‌کند */}
      {user && open && <button type="button" aria-label="بستن منو" className="lg:hidden fixed inset-0 z-30 bg-brand-navy/30" onClick={() => setOpen(false)} />}

      {surveyNudge && (
        <div className="bg-brand-ice border-b border-brand-mist text-center px-3 py-2 text-xs sm:text-sm">
          <Link href="/survey" className="font-bold text-brand-cyan-dark hover:underline">
            📝 نظرسنجی پایان بازی — نظرت را بگو
          </Link>
        </div>
      )}

      <main id="main" tabIndex={-1} className="flex-1 min-w-0 outline-none">
        {children}
      </main>

      <footer className="border-t border-brand-mist py-6 px-4 space-y-4 text-center text-xs text-brand-slate">
        {/* صفحهٔ فرود مهمان خودش شبکهٔ کامل لوگوها را دارد.
            footer-pillars: در حالت تیره نوار سفید پشت لوگوها برداشته و لوگوها تک‌رنگ روشن می‌شوند (theme.css) */}
        {(user || path !== "/") && (
          <div className="footer-pillars">
            <PillarStrip />
          </div>
        )}
        <div>میدان بنیان‌گذاران {GROUP_NAME} · روز برنامه‌نویس {fa(1405, { sep: false })}</div>
      </footer>

      <AskAgent loggedIn={!!user} />
      <PushPrompt loggedIn={!!user} />

      {/* نوار زبانه‌های پایین موبایل — مثل منوی اصلی فقط برای کاربر واردشده */}
      {user && (
        <NavBottomBar
          path={path}
          phase={phase}
          menuOpen={open}
          onMore={(button) => {
            menuOpenerRef.current = button;
            setOpen((o) => !o);
          }}
        />
      )}
    </div>
  );
}

function PhasePill({ phase, endsAt }: { phase: Phase; endsAt: string | null }) {
  // null در رندر سرور/هیدریشن: Date.now() سرور و کلاینت (و اختلاف ساعت گوشی‌ها) متن متفاوت
  // می‌ساخت و hydration mismatch کل پوسته را دوباره در کلاینت رندر می‌کرد.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const update = () => setNow(Date.now());
    const first = setTimeout(update, 0);
    const t = setInterval(update, 30_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, []);
  const remaining = endsAt && now !== null ? new Date(endsAt).getTime() - now : null;
  return (
    <span className="chip-cyan !py-1.5 max-w-[46vw] sm:max-w-none" title={remaining !== null ? `پایان در ${duration(remaining)}` : ""}>
      <span className="inline-block size-1.5 rounded-full bg-brand-cyan-dark pulse-ring shrink-0" aria-hidden />
      <span className="truncate">{PHASE_LABEL[phase]}</span>
      {remaining !== null && remaining > 0 && (
        <>
          {/* موبایل: نسخهٔ فشرده («۲س ۱۵د»)؛ صفحه‌خوان همان متن کامل را می‌خواند */}
          <span aria-hidden className="sm:hidden shrink-0 text-brand-slate font-medium fa-num">· {compactDuration(remaining)}</span>
          <span className="sr-only sm:not-sr-only sm:inline text-brand-slate font-medium">· {duration(remaining)}</span>
        </>
      )}
    </span>
  );
}

/** زمان باقی‌ماندهٔ فشرده برای موبایل: «۱روز ۳س» / «۲س ۱۵د» / «۱۲د» */
function compactDuration(ms: number) {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d) return h ? `${fa(d)}روز ${fa(h)}س` : `${fa(d)}روز`;
  if (h) return m ? `${fa(h)}س ${fa(m)}د` : `${fa(h)}س`;
  return `${fa(Math.max(1, m))}د`;
}
