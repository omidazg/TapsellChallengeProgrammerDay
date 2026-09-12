import { requireUser } from "@/lib/auth";
import { getPhase, phaseAtLeast } from "@/lib/phase";
import { Container, PageHeader, Locked, Alert } from "@/components/ui";
import { ensureAdSlots, marketStartFromSettings, closeDueSlots, slotsGrid } from "@/lib/adslots";
import { SlotGrid } from "./SlotGrid";
import { HypeClaim } from "./HypeClaim";

export const dynamic = "force-dynamic";

export default async function AdSlotsPage() {
  const user = await requireUser();
  const { phase } = await getPhase();

  if (!phaseAtLeast(phase, "BUILD")) {
    return (
      <Container>
        <PageHeader eyebrow="حراج جایگاه تبلیغاتی" title="حراج جایگاه تبلیغاتی" desc="تیم‌ها برای جایگاه‌های تبلیغاتی روز بازار پیشنهاد قیمت‌گذاری می‌دهند." />
        <Locked title="هنوز زود است" desc="این حراج از فاز «ساخت محصول» در دسترس است." />
      </Container>
    );
  }

  // پس از پایان بازی فقط خواندنی است: جایگاه تازه ساخته/بسته نمی‌شود.
  const readOnly = phase === "CLOSED";
  if (!readOnly) {
    const marketStart = await marketStartFromSettings();
    await ensureAdSlots(marketStart, 6);
    await closeDueSlots().catch(() => null);
  }

  const cells = await slotsGrid(user.teamId ?? null);

  return (
    <Container>
      <PageHeader
        eyebrow="حراج جایگاه تبلیغاتی"
        title="حراج جایگاه تبلیغاتی"
        desc="برای هر ساعت از روز بازار، سه جایگاه تبلیغاتی با حراج قیمت‌گذاری پنهانِ نوع دوم واگذار می‌شود."
      />
      <div className="grid gap-6">
        <div className="card p-5 bg-brand-ice">
          <h3 className="font-black text-brand-navy mb-2">قاعدهٔ حراج قیمت دوم چیست؟</h3>
          <p className="text-sm text-brand-slate leading-7">
            هر تیم فقط یک پیشنهاد مهروموم‌شده برای هر جایگاه ثبت می‌کند (تا لحظهٔ بسته‌شدن قابل ویرایش است). تیمی که بالاترین پیشنهاد را داده برندهٔ
            جایگاه می‌شود، اما فقط به‌اندازهٔ دومین بالاترین پیشنهاد پرداخت می‌کند — نه مبلغ پیشنهادی خودش. اگر فقط یک تیم پیشنهاد داده باشد، فقط
            یک سکهٔ نمادین پرداخت می‌کند. مجموع پیشنهادهای باز یک تیم هرگز از خزانهٔ تیم بیشتر نمی‌شود.
          </p>
        </div>

        {readOnly && <Alert kind="info">بازی تمام شده است؛ این صفحه فقط برای دیدن نتیجهٔ جایگاه‌هاست.</Alert>}

        {!readOnly && user.teamId && !user.team?.treasury && (
          <Alert kind="info">خزانهٔ تیم شما صفر است؛ ابتدا از سرمایه‌گذاری یا فروش محصول خزانه را پر کنید.</Alert>
        )}

        {!readOnly && <HypeClaim power={user.power} powerUsed={user.powerUsed} />}

        <div className="card p-5">
          <SlotGrid cells={cells} myTeamId={readOnly ? null : user.teamId ?? null} treasury={user.team?.treasury ?? 0} />
        </div>
      </div>
    </Container>
  );
}
