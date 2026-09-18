import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import "./theme.css";
import { getCurrentUser } from "@/lib/auth";
import { getPhase } from "@/lib/phase";
import { AppShell } from "@/components/AppShell";
import { AnnouncementBar } from "@/components/AnnouncementBar";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";

// فونت به‌صورت self-hosted (سرور به Google Fonts دسترسی ندارد؛ فونت متغیر همهٔ وزن‌ها را پوشش می‌دهد)
const vazir = localFont({
  src: "../fonts/Vazirmatn-Variable.woff2",
  variable: "--font-vazir",
  weight: "100 900",
  display: "swap",
  fallback: ["Tahoma", "sans-serif"],
});

const SITE_URL = process.env.SITE_URL ?? "http://89.42.199.174";
const SITE_TITLE = "میدان بنیان‌گذاران تپسل";
const SITE_DESCRIPTION = "بازار استارتاپی چهارروزهٔ روز برنامه‌نویس تپسل: ایده بده، سرمایه جذب کن، بساز، بفروش.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_TITLE, template: "%s · میدان بنیان‌گذاران تپسل" },
  description: SITE_DESCRIPTION,
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: "/",
    siteName: SITE_TITLE,
    locale: "fa_IR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
};

export const viewport: Viewport = {
  themeColor: "#002d47",
};

export const dynamic = "force-dynamic";

// اعمال پوستهٔ ذخیره‌شده پیش از رنگ‌آمیزی صفحه — بدون این اسکریپت، حالت تیره
// یک لحظه فلاش سفید نشان می‌دهد (hydration mismatch هم رخ نمی‌دهد چون این
// script از React خارج است و suppressHydrationWarning روی <html> ست شده).
const THEME_INIT_SCRIPT = `(function(){try{var m=localStorage.getItem("theme");var d=m==="dark"||(m==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.setAttribute("data-theme",d?"dark":"light");}catch(e){}})();`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [user, phaseInfo] = await Promise.all([getCurrentUser(), getPhase().catch(() => ({ phase: "REGISTRATION" as const, endsAt: null }))]);
  return (
    <html lang="fa" dir="rtl" className={vazir.variable} suppressHydrationWarning>
      <head>
        {/* اعمال فوری پوستهٔ ذخیره‌شده، پیش از اولین رنگ‌آمیزی صفحه (بدون فلاش نور) */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-screen bg-white text-brand-navy">
        <a href="#main" className="skip-link">
          پرش به محتوای اصلی
        </a>
        <ServiceWorkerRegister />
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
