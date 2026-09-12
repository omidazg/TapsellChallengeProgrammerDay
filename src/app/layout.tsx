import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { getCurrentUser } from "@/lib/auth";
import { getPhase } from "@/lib/phase";
import { AppShell } from "@/components/AppShell";
import { AnnouncementBar } from "@/components/AnnouncementBar";

// فونت به‌صورت self-hosted (سرور به Google Fonts دسترسی ندارد؛ فونت متغیر همهٔ وزن‌ها را پوشش می‌دهد)
const vazir = localFont({
  src: "../fonts/Vazirmatn-Variable.woff2",
  variable: "--font-vazir",
  weight: "100 900",
  display: "swap",
  fallback: ["Tahoma", "sans-serif"],
});

export const metadata: Metadata = {
  title: { default: "میدان بنیان‌گذاران تپسل", template: "%s · میدان بنیان‌گذاران تپسل" },
  description: "بازار استارتاپی چهارروزهٔ روز برنامه‌نویس تپسل: ایده بده، سرمایه جذب کن، بساز، بفروش.",
  icons: { icon: "/brand/favicon.svg" },
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [user, phaseInfo] = await Promise.all([getCurrentUser(), getPhase().catch(() => ({ phase: "REGISTRATION" as const, endsAt: null }))]);
  return (
    <html lang="fa" dir="rtl" className={vazir.variable}>
      <body className="min-h-screen bg-white text-brand-navy">
        <AnnouncementBar />
        <AppShell
          user={user ? { id: user.id, nickname: user.nickname, isAdmin: user.isAdmin, seedWallet: user.seedWallet, buyWallet: user.buyWallet, teamName: user.team?.name ?? null, avatarSeed: user.avatarSeed } : null}
          phase={phaseInfo.phase}
          phaseEndsAt={phaseInfo.endsAt?.toISOString() ?? null}
        >
          {children}
        </AppShell>
      </body>
    </html>
  );
}
