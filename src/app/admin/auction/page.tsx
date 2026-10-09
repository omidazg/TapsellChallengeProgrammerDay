import { requireAdmin } from "@/lib/auth";
import { listAuctions } from "@/lib/auction";
import { getPhase, getSettingInt } from "@/lib/phase";
import { AD_SLOT_KINDS, DEFAULTS } from "@/lib/constants";
import { adSlotPrices, slotsGrid, marketStartFromSettings, marketHoursFromSettings, type AdSlotKind } from "@/lib/adslots";
import { PageHeader, Container, Empty, Alert } from "@/components/ui";
import { coins, fa, jdatetime } from "@/lib/persian";
import { AuctionActionButtons, AdSlotActionButtons, MoveAuctionButtons } from "./ActionButtons";

export const metadata = { title: "حراج و جایگاه تبلیغاتی · پنل برگزارکننده" };

const STATUS_LABEL: Record<string, string> = { SCHEDULED: "در صف", LIVE: "زنده", ENDED: "پایان‌یافته" };
const SLOT_KINDS = Object.keys(AD_SLOT_KINDS) as AdSlotKind[];

/** ثانیه‌های باقی‌مانده تا یک زمان مشخص را حساب می‌کند (حداقل صفر). خارج از کامپوننت تا فراخوانی Date.now
 *  به‌عنوان «ناخالصی در رندر» شناخته نشود؛ این یک تابع کمکی معمولی است، نه خود کامپوننت. */
function secondsUntil(d: Date): number {
  return Math.max(0, Math.floor((d.getTime() - Date.now()) / 1000));
}

/** بر حسب ثانیه، متن فشردهٔ فارسی مثل «۱س ۲۰د» یا «۴۵ث» می‌سازد. */
function fmtDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const parts: string[] = [];
  if (h > 0) parts.push(`${fa(h)}س`);
  if (h > 0 || m > 0) parts.push(`${fa(m)}د`);
  if (h === 0) parts.push(`${fa(s)}ث`);
  return parts.join(" ");
}

function statusChip(status: string) {
  return status === "LIVE" ? "chip-red" : status === "ENDED" ? "chip-ok" : "chip-navy";
}

export default async function AdminAuctionPage() {
  await requireAdmin();
  const [auctions, { phase, endsAt }, auctionDurationSec, cutoffMin, prices, slots, marketStart, marketHours] = await Promise.all([
    listAuctions(),
    getPhase(),
    getSettingInt("auction_duration_sec", DEFAULTS.auctionDurationSec),
    getSettingInt("auction_enqueue_cutoff_min", DEFAULTS.auctionEnqueueCutoffMin),
    adSlotPrices(),
    slotsGrid(null),
    marketStartFromSettings(),
    marketHoursFromSettings(),
  ]);

  // برآورد زمان صف: تعداد حراج‌های هنوز پایان‌نیافته × مدت پیکربندی‌شدهٔ فعلی، در برابر زمان باقی‌ماندهٔ روز بازار.
  // توجه: مدت واقعی هر حراج توسط startNextAuction به‌صورت خودکار کوتاه‌تر می‌شود تا جا شود؛
  // این فقط هشدار پیشگیرانه است، نه محدودیت واقعی.
  const pendingCount = auctions.filter((a) => a.status !== "ENDED").length;
  const estimatedSec = pendingCount * auctionDurationSec;
  const secondsLeftInPhase = phase === "MARKET" && endsAt ? secondsUntil(endsAt) : null;
  const wontFit = secondsLeftInPhase !== null && pendingCount > 0 && estimatedSec > secondsLeftInPhase;

  // فقط حراج‌های در صف (SCHEDULED) جابه‌جا می‌شوند؛ اولی/آخری دکمهٔ بالا/پایین ندارد.
  const scheduledIds = auctions.filter((a) => a.status === "SCHEDULED").map((a) => a.id);
  const moveProps = (id: string) => {
    const i = scheduledIds.indexOf(id);
    return i < 0 ? null : { canUp: i > 0, canDown: i < scheduledIds.length - 1 };
  };

  // خلاصهٔ فروش جایگاه‌ها به تفکیک نوع
  const slotSummary = SLOT_KINDS.map((kind) => {
    const ofKind = slots.filter((s) => s.kind === kind);
    const sold = ofKind.filter((s) => s.state === "SOLD");
    return {
      kind,
      total: ofKind.length,
      sold: sold.length,
      open: ofKind.filter((s) => s.state === "OPEN").length,
      revenue: sold.reduce((sum, s) => sum + (s.pricePaid ?? 0), 0),
    };
  });
  const soldSlots = slots.filter((s) => s.state === "SOLD");

  return (
    <>
      <PageHeader
        eyebrow="پنل برگزارکننده"
        title="حراج و جایگاه تبلیغاتی"
        desc="حراج زندهٔ نسخه‌های ویژه بخشی از روز بازار است؛ صف آن و جایگاه‌های تبلیغاتی قیمت‌ثابت را اینجا مدیریت کن."
      />
      <Container className="space-y-8">
        <section className="card p-4 sm:p-6 space-y-4 anim-rise" aria-labelledby="auction-queue-title">
          <h2 id="auction-queue-title" className="text-lg font-black text-brand-navy">حراج نسخه‌های ویژه</h2>
          <p className="text-xs text-brand-slate break-words">
            هر تیم در «روز بازار» خودش نسخهٔ ویژهٔ محصولش را به صف می‌فرستد؛ در {fa(cutoffMin)} دقیقهٔ پایانی روز بازار صف بسته می‌شود.
            حراج‌ها فقط در فاز «روز بازار» شروع می‌شوند و پایان فاز، حراج زندهٔ باقی‌مانده را می‌بندد.
          </p>
          <AuctionActionButtons />
          {phase !== "MARKET" && (
            <Alert kind="info">فاز فعلی «روز بازار» نیست؛ شروع حراج تا آغاز روز بازار ممکن نیست، ولی چیدن صف آزاد است.</Alert>
          )}

          {pendingCount > 0 && (
            <Alert kind={wontFit ? "error" : "info"}>
              برآورد صف: {fa(pendingCount)} حراج باقی‌مانده × {fa(auctionDurationSec)} ثانیه ≈ {fmtDuration(estimatedSec)}
              {secondsLeftInPhase !== null && <> · زمان باقی‌ماندهٔ روز بازار: {fmtDuration(secondsLeftInPhase)}</>}
              {wontFit && " — با این مدت همهٔ حراج‌ها در روز بازار جا نمی‌شوند؛ مدت هر حراج هنگام شروع به‌صورت خودکار کوتاه‌تر می‌شود تا جا شود."}
            </Alert>
          )}
          {auctions.length === 0 ? (
            <Empty title="هنوز محصولی به صف حراج نیامده" desc="تیم‌ها در روز بازار محصولشان را به صف می‌فرستند." />
          ) : (
            <>
              {/* نمایش کارتی برای موبایل؛ جدول کامل فقط در md+ */}
              <div className="md:hidden space-y-3">
                {auctions.map((a) => {
                  const mv = moveProps(a.id);
                  return (
                    <div key={a.id} className="rounded-xl bg-brand-ice px-3 py-3 text-sm space-y-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-bold text-brand-navy break-words">
                          {fa(a.order + 1)}. {a.product.specialName} <span className="text-brand-slate font-medium">· {a.product.teamName}</span>
                        </span>
                        <span className={`chip shrink-0 ${statusChip(a.status)}`}>{STATUS_LABEL[a.status]}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-brand-slate">
                        <span>قیمت پایانی: <b className="fa-num text-brand-navy">{a.finalPrice !== null ? fa(a.finalPrice) : "—"}</b></span>
                        <span>برنده: <b className="text-brand-navy">{a.winnerNickname ?? "—"}</b></span>
                        <span>پایان: {a.endsAt ? jdatetime(new Date(a.endsAt)) : "—"}</span>
                      </div>
                      {mv && <MoveAuctionButtons auctionId={a.id} label={a.product.specialName} canUp={mv.canUp} canDown={mv.canDown} />}
                    </div>
                  );
                })}
              </div>

              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm min-w-[720px]">
                  <caption className="sr-only">صف حراج نسخه‌های ویژه</caption>
                  <thead>
                    <tr className="text-right text-brand-slate border-b border-brand-mist">
                      <th scope="col" className="px-3 py-2 font-bold">ترتیب</th>
                      <th scope="col" className="px-3 py-2 font-bold">محصول</th>
                      <th scope="col" className="px-3 py-2 font-bold">تیم</th>
                      <th scope="col" className="px-3 py-2 font-bold">وضعیت</th>
                      <th scope="col" className="px-3 py-2 font-bold">قیمت پایانی</th>
                      <th scope="col" className="px-3 py-2 font-bold">برنده</th>
                      <th scope="col" className="px-3 py-2 font-bold">پایان</th>
                      <th scope="col" className="px-3 py-2 font-bold">جابه‌جایی</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auctions.map((a) => {
                      const mv = moveProps(a.id);
                      return (
                        <tr key={a.id} className="border-b border-brand-mist last:border-0">
                          <td className="px-3 py-2 fa-num">{fa(a.order + 1)}</td>
                          <td className="px-3 py-2">{a.product.specialName}</td>
                          <td className="px-3 py-2 text-brand-slate">{a.product.teamName}</td>
                          <td className="px-3 py-2">
                            <span className={`chip ${statusChip(a.status)}`}>{STATUS_LABEL[a.status]}</span>
                          </td>
                          <td className="px-3 py-2 fa-num">{a.finalPrice !== null ? fa(a.finalPrice) : "—"}</td>
                          <td className="px-3 py-2">{a.winnerNickname ?? "—"}</td>
                          <td className="px-3 py-2 text-brand-slate">{a.endsAt ? jdatetime(new Date(a.endsAt)) : "—"}</td>
                          <td className="px-3 py-2">
                            {mv ? (
                              <MoveAuctionButtons auctionId={a.id} label={a.product.specialName} canUp={mv.canUp} canDown={mv.canDown} />
                            ) : (
                              <span className="text-brand-slate">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>

        <section className="card p-4 sm:p-6 space-y-4 anim-rise" aria-labelledby="adslots-title">
          <h2 id="adslots-title" className="text-lg font-black text-brand-navy">جایگاه‌های تبلیغاتی</h2>
          <p className="text-xs text-brand-slate break-words">
            جایگاه‌ها قیمت ثابت دارند و اولین تیمی که بخرد صاحبش می‌شود (بدون حراج و بدون نیاز به بستن). خرید از «ساخت محصول» تا
            پایان «روز بازار» باز است. روز بازار از {jdatetime(marketStart)} به مدت {fa(marketHours)} ساعت؛ برای هر ساعت و هر نوع یک
            جایگاه ساخته می‌شود (ساخت دوباره بی‌خطر است و فقط کمبودها را می‌سازد).
          </p>
          <AdSlotActionButtons />

          <ul className="grid gap-3 sm:grid-cols-3">
            {slotSummary.map((s) => (
              <li key={s.kind} className="rounded-xl bg-brand-ice px-3 py-3 text-sm space-y-1">
                <div className="font-bold text-brand-navy">
                  <span aria-hidden>{AD_SLOT_KINDS[s.kind].emoji}</span> {AD_SLOT_KINDS[s.kind].label}
                </div>
                <div className="text-xs text-brand-slate">قیمت ثابت: <b className="fa-num text-brand-navy">{coins(prices[s.kind])}</b></div>
                <div className="text-xs text-brand-slate">
                  فروخته: <b className="fa-num text-brand-navy">{fa(s.sold)}</b> از {fa(s.total)} · آزاد: {fa(s.open)}
                </div>
                <div className="text-xs text-brand-slate">درآمد: <b className="fa-num text-brand-navy">{coins(s.revenue)}</b></div>
              </li>
            ))}
          </ul>
          <p className="text-xs text-brand-slate">قیمت‌ها از تنظیمات (adslot_price_*) خوانده می‌شوند.</p>

          {slots.length === 0 ? (
            <Empty title="هنوز جایگاهی ساخته نشده" desc="با دکمهٔ بالا جایگاه‌های روز بازار را بساز." />
          ) : soldSlots.length === 0 ? (
            <p className="text-sm text-brand-slate">هنوز جایگاهی فروخته نشده است.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[480px]">
                <caption className="sr-only">جایگاه‌های فروخته‌شده</caption>
                <thead>
                  <tr className="text-right text-brand-slate border-b border-brand-mist">
                    <th scope="col" className="px-3 py-2 font-bold">ساعت</th>
                    <th scope="col" className="px-3 py-2 font-bold">نوع</th>
                    <th scope="col" className="px-3 py-2 font-bold">تیم</th>
                    <th scope="col" className="px-3 py-2 font-bold">مبلغ</th>
                  </tr>
                </thead>
                <tbody>
                  {soldSlots.map((s) => (
                    <tr key={s.id} className="border-b border-brand-mist last:border-0">
                      <td className="px-3 py-2 text-brand-slate">{jdatetime(new Date(s.hourStart))}</td>
                      <td className="px-3 py-2">
                        <span aria-hidden>{AD_SLOT_KINDS[s.kind].emoji}</span> {AD_SLOT_KINDS[s.kind].label}
                      </td>
                      <td className="px-3 py-2">{s.winnerTeamName ?? "—"}</td>
                      <td className="px-3 py-2 fa-num">{s.pricePaid !== null ? coins(s.pricePaid) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </Container>
    </>
  );
}
