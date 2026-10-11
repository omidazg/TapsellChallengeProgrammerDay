export const metadata = { title: "جایگاه تبلیغاتی" };
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getPhase, getSettingInt, phaseAtLeast } from "@/lib/phase";
import { AD_SLOT_KINDS, DEFAULTS } from "@/lib/constants";
import { Container, PageHeader, Locked, Alert } from "@/components/ui";
import { fa, coins } from "@/lib/persian";
import { ensureAdSlots, marketStartFromSettings, slotsGrid, adSlotPrices, type AdSlotKind } from "@/lib/adslots";
import { spendableBuyCoins } from "@/lib/market";
import { SlotGrid } from "./SlotGrid";

export const dynamic = "force-dynamic";

/** هر نوع جایگاه کجا دیده می‌شود */
const KIND_HINT: Record<AdSlotKind, string> = {
  BANNER: "بنر بالای صفحهٔ بازار",
  FEATURED: "کارت محصولت اول فهرست بازار با برچسب «ویژه»",
  PUSH: "یک اعلان به همهٔ شرکت‌کننده‌ها در شروع همان ساعت",
};

export default async function AdSlotsPage() {
  const user = await requireUser();
  const { phase } = await getPhase();

  if (!phaseAtLeast(phase, "BUILD")) {
    return (
      <Container>
        <PageHeader eyebrow="روز بازار" title="جایگاه تبلیغاتی" desc="تیم‌ها ساعت‌های تبلیغ روز بازار را با قیمت ثابت سکه می‌خرند." />
        <h2 className="sr-only">وضعیت جایگاه‌ها</h2>
        <Locked title="هنوز زود است" desc="خرید جایگاه تبلیغاتی از فاز «ساخت محصول» باز می‌شود." />
      </Container>
    );
  }

  // پس از پایان بازی فقط خواندنی است: جایگاه تازه ساخته نمی‌شود.
  const readOnly = phase === "CLOSED";
  if (!readOnly) {
    const marketStart = await marketStartFromSettings();
    await ensureAdSlots(marketStart);
  }

  const [cells, prices, maxPerTeam, spendable, myProduct] = await Promise.all([
    slotsGrid(user.teamId ?? null),
    adSlotPrices(),
    getSettingInt("adslot_max_per_team", DEFAULTS.adslotMaxPerTeam),
    spendableBuyCoins(user.id, user.buyWallet),
    user.teamId ? prisma.product.findUnique({ where: { teamId: user.teamId }, select: { submittedAt: true } }) : Promise.resolve(null),
  ]);

  const owned = cells.filter((c) => c.mine).length;
  const hasProduct = !!myProduct?.submittedAt;
  // دلیل اینکه کاربر الان نمی‌تواند بخرد (null یعنی می‌تواند؛ موجودی هر خانه جدا بررسی می‌شود)
  const blockReason = readOnly
    ? "بازی تمام شده است."
    : !user.teamId
      ? "جایگاه برای محصول تیم خریده می‌شود؛ اول عضو یک تیم شو یا «شرکت فردی» را انتخاب کن."
      : !hasProduct
        ? "اول محصولت را در «ساخت محصول» ثبت نهایی کن؛ تبلیغ به صفحهٔ محصولت می‌رسد."
        : owned >= maxPerTeam
          ? `تیمت به سقف ${fa(maxPerTeam)} جایگاه رسیده است.`
          : null;

  return (
    <Container>
      <PageHeader
        eyebrow="روز بازار"
        title="جایگاه تبلیغاتی"
        desc="هر ساعت از روز بازار سه جایگاه تبلیغاتی دارد که با قیمت ثابت سکه فروخته می‌شوند؛ اول‌آمده، اول‌خرید."
      />
      <div className="grid gap-6">
        <div className="card p-4 sm:p-6 bg-brand-ice space-y-3">
          <ul className="space-y-1.5 text-sm text-brand-navy">
            {(Object.keys(AD_SLOT_KINDS) as AdSlotKind[]).map((k) => (
              <li key={k} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <span aria-hidden>{AD_SLOT_KINDS[k].emoji}</span> <b>{AD_SLOT_KINDS[k].label}</b>
                  <span className="text-brand-slate"> — {KIND_HINT[k]}</span>
                </span>
                <span className="fa-num font-black">{coins(prices[k])}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-brand-slate leading-6">
            هر عضو تیم می‌تواند با سکه‌های خودش برای تیم بخرد. هر تیم حداکثر {fa(maxPerTeam)} جایگاه. جایگاه تبلیغاتی روی امتیاز اثری ندارد؛ فقط
            کمک می‌کند محصولت در بازار بیشتر دیده شود.
          </p>
        </div>

        {readOnly && <Alert kind="info">بازی تمام شده است؛ این صفحه فقط برای دیدن جایگاه‌های فروخته‌شده است.</Alert>}

        {!readOnly && (
          <div className="card p-4 flex flex-wrap items-center justify-between gap-3 text-sm">
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-brand-slate">
              {user.teamId && (
                <span>
                  جایگاه‌های تیمت: <b className="fa-num text-brand-navy">{fa(owned)} از {fa(maxPerTeam)}</b>
                </span>
              )}
              <span>
                سکه‌های قابل‌خرج تو: <b className="fa-num text-brand-navy">{coins(spendable)}</b>
              </span>
            </div>
            <Link href="/coins" className="text-xs font-bold text-brand-cyan-dark hover:underline">
              خرید سکه ←
            </Link>
          </div>
        )}

        {!readOnly && blockReason && <Alert kind="info">{blockReason}</Alert>}

        <div className="card p-4 sm:p-6">
          {/* هر ساعت در نمای موبایل h3 دارد؛ این h2 پنهان ترتیب سرتیترها را درست نگه می‌دارد */}
          <h2 className="sr-only">جدول ساعت‌ها و جایگاه‌ها</h2>
          <SlotGrid cells={cells} canBuy={!blockReason} spendable={spendable} />
        </div>
      </div>
    </Container>
  );
}
