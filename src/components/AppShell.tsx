"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { PHASE_LABEL, type Phase } from "@/lib/phases";
import { fa, duration } from "@/lib/persian";
import { Avatar } from "./Avatar";

type ShellUser = { id: string; nickname: string; isAdmin: boolean; seedWallet: number; buyWallet: number; teamName: string | null; avatarSeed: string };

const NAV: { href: string; label: string; phases?: Phase[] }[] = [
  { href: "/team", label: "اتاق تیم" },
  { href: "/idea", label: "اتاق ایده" },
  { href: "/invest", label: "سرمایه‌گذاری" },
  { href: "/build", label: "مرکز ساخت" },
  { href: "/market", label: "بازار" },
  { href: "/auction", label: "حراج زنده" },
  { href: "/adslots", label: "جایگاه تبلیغاتی" },
  { href: "/leaderboard", label: "جدول" },
];

export function AppShell({ user, phase, phaseEndsAt, children }: { user: ShellUser | null; phase: Phase; phaseEndsAt: string | null; children: React.ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-40 bg-white/85 backdrop-blur border-b border-brand-mist">
        <div className="mx-auto max-w-7xl px-4 h-16 flex items-center gap-4">
          <Link href="/" className="flex items-center gap-3 shrink-0">
            <Image src="/brand/tapsell-logo.png" alt="تپسل" width={110} height={20} priority className="h-5 w-auto" />
            <span className="hidden sm:inline text-sm font-black text-brand-navy border-r border-brand-mist pr-3">میدان بنیان‌گذاران</span>
          </Link>
          {user && (
            <nav className="hidden lg:flex items-center gap-1 mr-2">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className={`rounded-pill px-3 py-1.5 text-sm font-bold transition ${path.startsWith(n.href) ? "bg-brand-navy text-white" : "text-brand-navy hover:bg-brand-ice"}`}>
                  {n.label}
                </Link>
              ))}
              {user.isAdmin && (
                <Link href="/admin" className={`rounded-pill px-3 py-1.5 text-sm font-bold ${path.startsWith("/admin") ? "bg-brand-red text-white" : "text-brand-red hover:bg-red-50"}`}>
                  برگزارکننده
                </Link>
              )}
            </nav>
          )}
          <div className="mr-auto flex items-center gap-2">
            <PhasePill phase={phase} endsAt={phaseEndsAt} />
            {user ? (
              <>
                <Link href="/wallet" className="hidden md:flex items-center gap-2 rounded-pill bg-brand-ice px-3 py-1.5 text-xs font-bold text-brand-navy hover:bg-brand-mist">
                  <span title="کیف بذر">🌱 {fa(user.seedWallet)}</span>
                  <span className="text-brand-slate">|</span>
                  <span title="کیف خرید">🛒 {fa(user.buyWallet)}</span>
                </Link>
                <Link href="/profile" className="flex items-center gap-2">
                  <Avatar seed={user.avatarSeed || user.id} size={34} />
                </Link>
                <button className="lg:hidden btn-ghost !px-3 !py-1.5" onClick={() => setOpen((o) => !o)} aria-label="منو">☰</button>
              </>
            ) : (
              <>
                <Link href="/login" className="btn-ghost !py-1.5">ورود</Link>
                <Link href="/register" className="btn-primary !py-1.5">ثبت‌نام</Link>
              </>
            )}
          </div>
        </div>
        {user && open && (
          <nav className="lg:hidden border-t border-brand-mist bg-white px-4 py-3 grid grid-cols-2 gap-2">
            {[...NAV, { href: "/wallet", label: "کیف پول" }, { href: "/profile", label: "پروفایل" }, ...(user.isAdmin ? [{ href: "/admin", label: "برگزارکننده" }] : [])].map((n) => (
              <Link key={n.href} href={n.href} onClick={() => setOpen(false)} className={`rounded-2xl px-3 py-2 text-sm font-bold ${path.startsWith(n.href) ? "bg-brand-navy text-white" : "bg-brand-ice text-brand-navy"}`}>
                {n.label}
              </Link>
            ))}
          </nav>
        )}
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-brand-mist py-6 text-center text-xs text-brand-slate">
        میدان بنیان‌گذاران تپسل · روز برنامه‌نویس {fa(1405)}
      </footer>
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
    <span className="chip-cyan !py-1.5 whitespace-nowrap" title={remaining !== null ? `پایان در ${duration(remaining)}` : ""}>
      <span className="inline-block size-1.5 rounded-full bg-brand-cyan-dark pulse-ring" />
      {PHASE_LABEL[phase]}
      {remaining !== null && remaining > 0 && <span className="hidden sm:inline text-brand-slate font-medium">· {duration(remaining)}</span>}
    </span>
  );
}
