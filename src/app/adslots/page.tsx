export const metadata = { title: "جایگاه تبلیغاتی" };
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getSettingInt } from "@/lib/phase";
import { moduleStatusFor } from "@/lib/module-state";
import { AD_SLOT_KINDS, DEFAULTS } from "@/lib/constants";
import { Container, PageHeader, Alert } from "@/components/ui";
import { ModuleClosed, ModuleReadOnly } from "@/components/ModuleState";
import { fa, coins } from "@/lib/persian";
import { ensureAdSlots, marketStartFromSettings, slotsGrid, adSlotPrices, type AdSlotKind } from "@/lib/adslots";
import { spendableBuyCoins } from "@/lib/market";
import { SlotGrid } from "./SlotGrid";

export const dynamic = "force-dynamic";

/** هر نوع جایگاه کجا دیده می‌شود */
const KIND_HINT: Record<AdSlotKind, string> = {
  BANNER: "بنر بالای صفحهٔ بازار",
  FEATURED: "کارت محصولت اول فهرست بازار با برچسب «ویژه»",
  PUSH: "یک اعلان به همهٔ شرکت‌کننده‌ها در شروع همان بازه",
};

export default async function AdSlotsPage() {
  const user = await requireUser();

  const status = await moduleStatusFor("adslots", user.teamId);
  if (status === "hidden") notFound();
  if (status === "closed") return <ModuleClosed moduleKey="adslots" title="جایگاه تبلیغاتی" />;

  // فقط‌خواندنی: جایگاه تازه ساخته نمی‌شود.
  const readOnly = status !== "open";
  if (!readOnly) {
    const marketStart = await marketStartFromSettings();
    await ensureAdSlots(marketStart);
  }

  const [cells, prices, maxPerTeam, spendable, products] = await Promise.all([
    slotsGrid(user.teamId ?? null),
    adSlotPrices(),
    getSettingInt("adslot_max_per_team", DEFAULTS.adslotMaxPerTeam),
    spendableBuyCoins(user.id, user.buyWallet),
    user.teamId
      ? prisma.product.findMany({
          where: { teamId: user.teamId, submittedAt: { not: null } },
          select: { id: true, name: true, track: { select: { name: true } } },
          orderBy: { submittedAt: "asc" },
        })
      : Promise.resolve([]),
  ]);

  // سقف تیم فقط بازه‌های آینده‌ای را می‌شمارد که تیم پیشنهاد برترشان را دارد.
  const owned = cells.filter((c) => c.mine && c.state === "OPEN").length;
  const atCap = owned >= maxPerTeam;
  // دلیل اینکه کاربر الان نمی‌تواند پیشنهاد بدهد (null یعنی می‌تواند؛ موجودی و سقف هر خانه جدا بررسی می‌شوند)
  const blockReason = readOnly
    ? "این بخش الان فقط برای دیدن است."
    : !user.teamId
      ? "پیشنهاد برای محصول تیم ثبت می‌شود؛ اول عضو یک تیم شو یا «شرکت فردی» را انتخاب کن."
      : products.length === 0
        ? "اول محصولت را در «مرکز ساخت» ثبت نهایی کن؛ تبلیغ به صفحهٔ محصولت می‌رسد."
        : null;

  return (
    <Container>
      <PageHeader
        title="جایگاه تبلیغاتی"
        desc="هر بازه سه جایگاه تبلیغاتی دارد که با پیشنهاد سکه واگذار می‌شوند: بالاترین پیشنهاد تا شروع بازه برنده است و اگر کسی بالاتر پیشنهاد بدهد، سکهٔ نفر قبلی کامل برمی‌گردد."
      />
      <div className="grid gap-6">
        {status === "ro" && <ModuleReadOnly moduleKey="adslots" />}

        <div className="card p-4 sm:p-6 bg-brand-ice space-y-3">
          <ul className="space-y-1.5 text-sm text-brand-navy">
            {(Object.keys(AD_SLOT_KINDS) as AdSlotKind[]).map((k) => (
              <li key={k} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <span aria-hidden>{AD_SLOT_KINDS[k].emoji}</span> <b>{AD_SLOT_KINDS[k].label}</b>
                  <span className="text-brand-slate"> — {KIND_HINT[k]}</span>
                </span>
                <span className="fa-num font-black">حداقل پیشنهاد {coins(prices[k])}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-brand-slate leading-6">
            هر عضو تیم می‌تواند با سکه‌های خودش برای یکی از محصول‌های ثبت‌شدهٔ تیم پیشنهاد بدهد. هر تیم هم‌زمان پیشنهاد برتر حداکثر {fa(maxPerTeam)} بازهٔ آینده را
            می‌تواند داشته باشد. جایگاه تبلیغاتی روی امتیاز اثری ندارد؛ فقط کمک می‌کند محصولت در بازار بیشتر دیده شود.
          </p>
        </div>

        {!readOnly && (
          <div className="card p-4 flex flex-wrap items-center justify-between gap-3 text-sm">
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-brand-slate">
              {user.teamId && (
                <span>
                  پیشنهادهای برتر تیمت: <b className="fa-num text-brand-navy">{fa(owned)} از {fa(maxPerTeam)}</b>
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
        {!readOnly && !blockReason && atCap && (
          <Alert kind="info">تیمت به سقف {fa(maxPerTeam)} بازه رسیده است؛ تا وقتی پیشنهاد برتر این بازه‌ها را داری فقط می‌توانی همان‌ها را بالا ببری.</Alert>
        )}

        <div className="card p-4 sm:p-6">
          <h2 className="sr-only">جدول بازه‌ها و جایگاه‌ها</h2>
          <SlotGrid
            cells={cells}
            products={products.map((p) => ({ id: p.id, label: `${p.name} (${p.track.name})` }))}
            canBid={!blockReason}
            atCap={atCap}
            spendable={spendable}
            showPast={readOnly}
          />
        </div>
      </div>
    </Container>
  );
}
