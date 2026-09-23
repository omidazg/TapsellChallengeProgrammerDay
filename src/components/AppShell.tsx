"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { PHASE_LABEL, type Phase } from "@/lib/phases";
import { fa, duration } from "@/lib/persian";
import { Avatar } from "./Avatar";
import { NotificationBell } from "./NotificationBell";
import { ThemeToggle } from "./ThemeToggle";
import { AskAgent } from "./AskAgent";

type ShellUser = { id: string; nickname: string; isAdmin: boolean; seedWallet: number; buyWallet: number; teamName: string | null; avatarSeed: string };

const NAV: { href: string; label: string; icon: string }[] = [
  { href: "/team", label: "اتاق تیم", icon: "👥" },
  { href: "/idea", label: "اتاق ایده", icon: "💡" },
  { href: "/invest", label: "سرمایه‌گذاری", icon: "🌱" },
  { href: "/build", label: "مرکز ساخت", icon: "🛠️" },
  { href: "/market", label: "بازار", icon: "🛒" },
  { href: "/auction", label: "حراج زنده", icon: "🔨" },
  { href: "/adslots", label: "جایگاه تبلیغاتی", icon: "📣" },
  { href: "/leaderboard", label: "جدول", icon: "🏆" },
  { href: "/guide", label: "راهنما", icon: "📖" },
];

function isActive(path: string, href: string) {
  return path === href || path.startsWith(href + "/");
}

export function AppShell({ user, phase, phaseEndsAt, children }: { user: ShellUser | null; phase: Phase; phaseEndsAt: string | null; children: React.ReactNode }) {
  const path = usePathname();
  const menuButtonRef = useRef<HTMLButtonElement>(null);
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
        menuButtonRef.current?.focus();
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
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-brand-mist">
        {/* ردیف اول: لوگو + وضعیت + کاربر */}
        <div className="mx-auto max-w-7xl px-3 sm:px-4 h-14 sm:h-16 flex items-center gap-2 sm:gap-4">
          <Link href="/" className="flex items-center gap-2 sm:gap-3 shrink-0" aria-label="صفحهٔ اصلی">
            <Image src="/brand/tapsell-logo.png" alt="تپسل" width={110} height={20} priority className="h-4 sm:h-5 w-auto" />
            <span className="hidden md:inline text-sm font-black text-brand-navy border-r border-brand-mist pr-3 whitespace-nowrap">میدان بنیان‌گذاران</span>
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
                  onClick={() => setOpen((o) => !o)}
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
              {NAV.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  aria-current={isActive(path, n.href) ? "page" : undefined}
                  className={`rounded-pill px-3.5 py-1.5 text-sm font-bold whitespace-nowrap transition ${isActive(path, n.href) ? "bg-brand-navy text-white" : "text-brand-navy hover:bg-brand-ice"}`}
                >
                  {n.label}
                </Link>
              ))}
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
              className="absolute inset-x-0 z-40 border-t border-brand-mist bg-white px-3 py-3 shadow-lift max-h-[calc(100dvh-3.5rem)] overflow-y-auto"
            >
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {[...NAV, { href: "/wallet", label: "کیف پول", icon: "💰" }, { href: "/profile", label: "پروفایل", icon: "🙂" }, ...(user.isAdmin ? [{ href: "/admin", label: "برگزارکننده", icon: "🎛️" }] : [])].map((n) => (
                  <Link
                    key={n.href}
                    href={n.href}
                    onClick={() => setOpen(false)}
                    aria-current={isActive(path, n.href) ? "page" : undefined}
                    className={`flex items-center gap-2 rounded-2xl px-3 py-3 text-sm font-bold min-h-12 ${isActive(path, n.href) ? "bg-brand-navy text-white" : n.href === "/admin" ? "bg-red-50 text-brand-red" : "bg-brand-ice text-brand-navy"}`}
                  >
                    <span aria-hidden>{n.icon}</span>
                    <span className="truncate">{n.label}</span>
                  </Link>
                ))}
              </div>
              <div className="md:hidden mt-3 flex items-center justify-between rounded-2xl border border-brand-mist px-4 py-2.5 text-xs font-bold text-brand-navy">
                <span>🌱 کیف بذر: {fa(user.seedWallet)}</span>
                <span>🛒 کیف خرید: {fa(user.buyWallet)}</span>
              </div>
              <div className="mt-3">
                <NotificationBell phase={phase} variant="mobile" />
              </div>
              <div className="mt-3 flex items-center justify-between rounded-2xl border border-brand-mist px-4 py-2.5">
                <span className="text-xs font-bold text-brand-navy">پوستهٔ نمایش</span>
                <ThemeToggle />
              </div>
              <form action="/logout" method="post" className="mt-3">
                <button type="submit" className="btn-ghost w-full !text-brand-red !border-red-100 hover:!bg-red-50">🚪 خروج از حساب</button>
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

      <footer className="border-t border-brand-mist py-6 px-4 text-center text-xs text-brand-slate">
        میدان بنیان‌گذاران تپسل · روز برنامه‌نویس {fa(1405, { sep: false })}
      </footer>

      <AskAgent />
    </div>
  );
}

function PhasePill({ phase, endsAt }: { phase: Phase; endsAt: string | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const remaining = endsAt ? new Date(endsAt).getTime() - now : null;
  return (
    <span className="chip-cyan !py-1.5 max-w-[46vw] sm:max-w-none" title={remaining !== null ? `پایان در ${duration(remaining)}` : ""}>
      <span className="inline-block size-1.5 rounded-full bg-brand-cyan-dark pulse-ring shrink-0" />
      <span className="truncate">{PHASE_LABEL[phase]}</span>
      {remaining !== null && remaining > 0 && <span className="hidden sm:inline text-brand-slate font-medium">· {duration(remaining)}</span>}
    </span>
  );
}
