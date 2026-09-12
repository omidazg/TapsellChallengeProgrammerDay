import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { getPhase } from "@/lib/phase";
import { getAdminCounts, getSettingsMap } from "@/lib/admin";
import { PageHeader, Container, Stat } from "@/components/ui";
import { fa, coins } from "@/lib/persian";
import { PhaseForm } from "./PhaseForm";
import { SettingsForm } from "./SettingsForm";

export const metadata = { title: "پنل برگزارکننده" };

const SUBPAGES = [
  { href: "/admin/teams", label: "تیم‌ها", emoji: "👥" },
  { href: "/admin/jury", label: "هیئت داوران", emoji: "🧑‍⚖️" },
  { href: "/admin/auction", label: "حراج زنده", emoji: "🔨" },
  { href: "/admin/flags", label: "پرچم‌های تخلف", emoji: "🚩" },
  { href: "/admin/users", label: "کاربران", emoji: "🧑‍💻" },
  { href: "/admin/export", label: "خروجی گزارش‌ها", emoji: "📤" },
];

export default async function AdminPage() {
  await requireAdmin();
  const [{ phase, endsAt }, counts, settings] = await Promise.all([getPhase(), getAdminCounts(), getSettingsMap()]);

  return (
    <>
      <PageHeader eyebrow="پنل برگزارکننده" title="داشبورد برگزارکننده" desc="کنترل فاز بازی، تنظیمات و نظارت بر میدان." />
      <Container className="space-y-8">
        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4 stagger">
          <Stat label="کاربران" value={fa(counts.users)} tone="navy" />
          <Stat label="تیم‌ها" value={fa(counts.teams)} tone="navy" />
          <Stat label="ایده‌های ثبت‌شده" value={fa(counts.ideasSubmitted)} tone="cyan" />
          <Stat label="محصولات ثبت‌شده" value={fa(counts.productsSubmitted)} tone="cyan" />
          <Stat label="حجم خرید بازار" value={coins(counts.purchasesVolume)} hint={`${fa(counts.purchasesCount)} تراکنش`} tone="red" />
        </div>

        <div className="grid md:grid-cols-2 gap-4 stagger">
          {SUBPAGES.map((s) => (
            <Link key={s.href} href={s.href} className="card p-5 flex items-center gap-3 hover:shadow-lift transition">
              <span className="text-2xl">{s.emoji}</span>
              <span className="font-bold text-brand-navy">{s.label}</span>
            </Link>
          ))}
        </div>

        <PhaseForm phase={phase} endsAt={endsAt ? endsAt.toISOString() : null} />
        <SettingsForm settings={settings} />
      </Container>
    </>
  );
}
