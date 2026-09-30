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
const SITE_TITLE = "میدان بنیان‌گذاران";
const SITE_DESCRIPTION = "بازار استارتاپی چهارروزهٔ روز برنامه‌نویس گروه پگاه: ایده بده، سرمایه جذب کن، بساز، بفروش.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_TITLE, template: "%s · میدان بنیان‌گذاران" },
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
  // تا env(safe-area-inset-*) روی آیفون مقدار واقعی بدهد (نوار زبانه‌های پایین موبایل از آن فاصله می‌گیرد)
  viewportFit: "cover",
};

export const dynamic = "force-dynamic";

// اعمال پوستهٔ ذخیره‌شده پیش از رنگ‌آمیزی صفحه — بدون این اسکریپت، حالت تیره
// یک لحظه فلاش سفید نشان می‌دهد (hydration mismatch هم رخ نمی‌دهد چون این
// script از React خارج است و suppressHydrationWarning روی <html> ست شده).
// بدون انتخاب ذخیره‌شده (یا با "system") از prefers-color-scheme پیروی می‌شود؛
// فقط انتخاب صریح "light"/"dark" آن را کنار می‌گذارد. هم‌خوان با ThemeToggle.tsx.
const THEME_INIT_SCRIPT = `(function(){var d=false;try{var m=localStorage.getItem("theme");d=m==="dark"||(m!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);}catch(e){try{d=matchMedia("(prefers-color-scheme: dark)").matches;}catch(e2){}}document.documentElement.setAttribute("data-theme",d?"dark":"light");})();`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [user, phaseInfo] = await Promise.all([getCurrentUser(), getPhase().catch(() => ({ phase: "REGISTRATION" as const, endsAt: null }))]);
  return (
    <html lang="fa" dir="rtl" className={vazir.variable} suppressHydrationWarning>
      <head>
        {/* اعمال فوری پوستهٔ ذخیره‌شده، پیش از اولین رنگ‌آمیزی صفحه (بدون فلاش نور) */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      {/* رنگ زمینه/متن از متغیرهای معنایی globals.css/theme.css می‌آید (body { background: var(--bg) })؛
          کلاس bg-white اینجا در حالت تیره به‌جای --bg رنگ سطح کارت را می‌داد و کارت‌ها در زمینه گم می‌شدند. */}
      <body className="min-h-screen">
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
