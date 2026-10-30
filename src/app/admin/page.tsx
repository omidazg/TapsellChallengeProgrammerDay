import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  areEconomySettingsLocked,
  getAdminCounts,
  getSettingsMap,
  SETTING_KEYS,
  SETTING_LABELS,
  getSchedulerSettingsMap,
  SCHEDULER_SETTING_KEYS,
  SCHEDULER_SETTING_LABELS,
  SCHEDULER_SETTING_KINDS,
} from "@/lib/admin";
import { PageHeader, Container, Stat, Alert } from "@/components/ui";
import { fa, coins } from "@/lib/persian";
import { getPaymentDriver } from "@/lib/coins";
import { SettingsForm, type SettingField } from "./SettingsForm";
import { updateSchedulerSettingsAction } from "./scheduler-actions";
import { AiUsageCard } from "@/components/AiUsageCard";
import { isLockedSettingKey } from "@/lib/settings-lock";
import { ADMIN_SECTIONS, ADMIN_EXTRA_LINKS } from "./nav-items";

export const metadata = { title: "پنل برگزارکننده" };

// بخش‌ها از همان فهرست ناوبری کناری می‌آیند تا برچسب‌ها یک‌جا نگه داشته شوند.
const SUBPAGES = [...ADMIN_SECTIONS.filter((s) => s.href !== "/admin"), ...ADMIN_EXTRA_LINKS];

export default async function AdminPage() {
  await requireAdmin();
  const [counts, settings, schedulerSettings, pendingRequests, economyLocked, prizeSum] = await Promise.all([
    getAdminCounts(),
    getSettingsMap(),
    getSchedulerSettingsMap(),
    prisma.accessRequest.count({ where: { status: "PENDING" } }),
    // از اولین خرج سکه کلیدهای اقتصادی قفل و فقط‌خواندنی‌اند.
    areEconomySettingsLocked(),
    prisma.prize.aggregate({ _sum: { amountToman: true }, _count: true }),
  ]);
  const paymentDriver = getPaymentDriver().name;

  const settingFields: SettingField[] = SETTING_KEYS.map((key) => ({
    key,
    label: SETTING_LABELS[key],
    // market_starts_at خام (ISO) فرستاده می‌شود؛ SettingsForm در مرورگر به وقت محلی تبدیلش می‌کند.
    value: settings[key],
    kind: key === "market_starts_at" ? "datetime" : "number",
    locked: economyLocked && isLockedSettingKey(key),
  }));
  const schedulerFields: SettingField[] = SCHEDULER_SETTING_KEYS.map((key) => ({
    key,
    label: SCHEDULER_SETTING_LABELS[key],
    value: schedulerSettings[key],
    kind: SCHEDULER_SETTING_KINDS[key],
  }));

  return (
    <>
      <PageHeader eyebrow="پنل برگزارکننده" title="داشبورد برگزارکننده" desc="نمای کلی مسابقه، تنظیمات و دسترسی به همهٔ بخش‌ها." />
      <Container className="space-y-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 stagger">
          <Stat label="کاربران" value={fa(counts.users)} tone="navy" />
          <Stat label="تیم‌ها" value={fa(counts.teams)} tone="navy" />
          <Stat label="ایده‌های ثبت‌شده" value={fa(counts.ideasSubmitted)} tone="cyan" />
          <Stat label="محصولات ثبت‌شده" value={fa(counts.productsSubmitted)} tone="cyan" />
          <Stat label="حجم خرید بازار" value={coins(counts.purchasesVolume)} hint={`${fa(counts.purchasesCount)} تراکنش`} tone="red" />
          <Stat label="جمع جوایز" value={fa(prizeSum._sum.amountToman ?? 0)} hint={`تومان · ${fa(prizeSum._count)} جایزه`} tone="gold" />
        </div>

        {paymentDriver === "fake" && (
          <Alert kind="error">
            ⚠ درگاه پرداخت آزمایشی (fake) فعال است و پولی واقعاً دریافت نمی‌شود. پیش از شروع مسابقه درایور پرداخت را
            تنظیم کن (جزئیات در <Link href="/admin/coins" className="underline font-bold">سکه و پرداخت</Link>).
          </Alert>
        )}

        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 stagger">
          {SUBPAGES.map((s) => (
            <Link key={s.href} href={s.href} className="card p-4 flex flex-wrap items-center gap-2 min-h-16 hover:shadow-lift transition">
              <span className="text-xl" aria-hidden>{s.emoji}</span>
              <span className="font-bold text-sm text-brand-navy">{s.label}</span>
              {s.href === "/admin/whitelist" && pendingRequests > 0 && (
                <span className="chip-red ms-auto">{fa(pendingRequests)} درخواست تازه</span>
              )}
            </Link>
          ))}
        </div>

        <AiUsageCard />

        <SettingsForm fields={settingFields} />
        <SettingsForm fields={schedulerFields} action={updateSchedulerSettingsAction} title="حراج خودکار" />
      </Container>
    </>
  );
}
