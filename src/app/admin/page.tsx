import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getPhase, PHASES, PHASE_LABEL } from "@/lib/phase";
import {
  getAdminCounts,
  getSettingsMap,
  SETTING_KEYS,
  SETTING_LABELS,
  getSchedulerSettingsMap,
  SCHEDULER_SETTING_KEYS,
  SCHEDULER_SETTING_LABELS,
  SCHEDULER_SETTING_KINDS,
} from "@/lib/admin";
import { PageHeader, Container, Stat } from "@/components/ui";
import { fa, coins } from "@/lib/persian";
import { PhaseForm } from "./PhaseForm";
import { SettingsForm, type SettingField } from "./SettingsForm";
import { updateSchedulerSettingsAction } from "./scheduler-actions";
import { AiUsageCard } from "@/components/AiUsageCard";
import { areEconomySettingsLocked, isLockedSettingKey } from "@/lib/settings-lock";
import { ADMIN_SECTIONS, ADMIN_EXTRA_LINKS } from "./nav-items";

export const metadata = { title: "پنل برگزارکننده" };

// بخش‌ها از همان فهرست ناوبری کناری می‌آیند تا برچسب‌ها یک‌جا نگه داشته شوند.
const SUBPAGES = [...ADMIN_SECTIONS.filter((s) => s.href !== "/admin"), ...ADMIN_EXTRA_LINKS];

export default async function AdminPage() {
  await requireAdmin();
  const [{ phase, endsAt }, counts, settings, schedulerSettings, pendingRequests] = await Promise.all([
    getPhase(),
    getAdminCounts(),
    getSettingsMap(),
    getSchedulerSettingsMap(),
    prisma.accessRequest.count({ where: { status: "PENDING" } }),
  ]);

  const phaseOptions = PHASES.map((p) => ({ value: p, label: PHASE_LABEL[p] }));
  // مدت پیکربندی‌شدهٔ هر فاز (همان که زمان‌بند خودکار با parseInt می‌خواند) برای دکمهٔ «رفتن به فاز بعد».
  const phaseHours: Record<string, number | null> = {};
  for (const p of PHASES) {
    const raw = (schedulerSettings as Record<string, string | undefined>)[`phase_hours_${p}`];
    const hours = raw !== undefined ? parseInt(raw, 10) : NaN;
    phaseHours[p] = Number.isFinite(hours) && hours > 0 ? hours : null;
  }
  // پس از شروع بازی (خروج از REGISTRATION) کلیدهای اقتصادی قفل و فقط‌خواندنی‌اند.
  const economyLocked = areEconomySettingsLocked(phase);
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
      <PageHeader eyebrow="پنل برگزارکننده" title="داشبورد برگزارکننده" desc="کنترل فاز بازی، تنظیمات و نظارت بر میدان." />
      <Container className="space-y-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 stagger">
          <Stat label="کاربران" value={fa(counts.users)} tone="navy" />
          <Stat label="تیم‌ها" value={fa(counts.teams)} tone="navy" />
          <Stat label="ایده‌های ثبت‌شده" value={fa(counts.ideasSubmitted)} tone="cyan" />
          <Stat label="محصولات ثبت‌شده" value={fa(counts.productsSubmitted)} tone="cyan" />
          <Stat label="حجم خرید بازار" value={coins(counts.purchasesVolume)} hint={`${fa(counts.purchasesCount)} تراکنش`} tone="red" />
        </div>

        {/* کنترل فاز پرکاربردترین ابزار روز بازی است؛ بالاتر از کارت‌های بخش‌ها */}
        <PhaseForm
          phase={phase}
          endsAt={endsAt ? endsAt.toISOString() : null}
          phases={phaseOptions}
          phaseHours={phaseHours}
        />

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
        {/* لنگر #scheduler از نوار وضعیت بالای پنل («پیشروی خودکار: روشن/خاموش») */}
        <div id="scheduler" className="scroll-mt-32">
          <SettingsForm
            fields={schedulerFields}
            action={updateSchedulerSettingsAction}
            title="زمان‌بند خودکار"
          />
        </div>
      </Container>
    </>
  );
}
