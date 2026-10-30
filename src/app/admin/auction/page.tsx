import { requireAdmin } from "@/lib/auth";
import { listAuctions } from "@/lib/auction";
import { getPhase, getSettingInt } from "@/lib/phase";
import { getModuleStatus } from "@/lib/module-state";
import { AD_SLOT_KINDS, DEFAULTS } from "@/lib/constants";
import { adSlotPrices, slotsGrid, marketStartFromSettings, type AdSlotKind } from "@/lib/adslots";
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
  const [auctions, { phase, endsAt }, auctionDurationSec, cutoffMin, prices, slots, marketStart, slotHours, marketStatus] = await Promise.all([
    listAuctions(),
    getPhase(),
    getSettingInt("auction_duration_sec", DEFAULTS.auctionDurationSec),
    getSettingInt("auction_enqueue_cutoff_min", DEFAULTS.auctionEnqueueCutoffMin),
    adSlotPrices(),
    slotsGrid(null),
    marketStartFromSettings(),
    getSettingInt("adslot_hours", DEFAULTS.adslotHours),
    getModuleStatus("market"),
  ]);

  // برآورد زمان صف: تعداد حراج‌های هنوز پایان‌نیافته × مدت پیکربندی‌شدهٔ فعلی، در برابر زمان باقی‌مانده تا ددلاین نهایی.
  // توجه: مدت واقعی هر حراج توسط startNextAuction به‌صورت خودکار کوتاه‌تر می‌شود تا جا شود؛
  // این فقط هشدار پیشگیرانه است، نه محدودیت واقعی.
  const pendingCount = auctions.filter((a) => a.status !== "ENDED").length;
  const estimatedSec = pendingCount * auctionDurationSec;
  const secondsLeft = phase !== "CLOSED" && endsAt ? secondsUntil(endsAt) : null;
  const wontFit = secondsLeft !== null && pendingCount > 0 && estimatedSec > secondsLeft;

  // فقط حراج‌های در صف (SCHEDULED) جابه‌جا می‌شوند؛ اولی/آخری دکمهٔ بالا/پایین ندارد.
  const scheduledIds = auctions.filter((a) => a.status === "SCHEDULED").map((a) => a.id);
  const moveProps = (id: string) => {
    const i = scheduledIds.indexOf(id);
    return i < 0 ? null : { canUp: i > 0, canDown: i < scheduledIds.length - 1 };
  };

  // خلاصهٔ پیشنهادهای جایگاه به تفکیک نوع؛ سکهٔ پیشنهادِ جایگزین‌شده برگشته است، پس فقط صاحب فعلی حساب می‌شود.
  const claimedSlots = slots.filter((s) => s.winnerTeamId !== null);
  const slotSummary = SLOT_KINDS.map((kind) => {
    const ofKind = slots.filter((s) => s.kind === kind);
    const claimed = ofKind.filter((s) => s.winnerTeamId !== null);
    return {
      kind,
      total: ofKind.length,
      claimed: claimed.length,
      open: ofKind.filter((s) => s.state === "OPEN").length,
      revenue: claimed.reduce((sum, s) => sum + (s.pricePaid ?? 0), 0),
    };
  });

  return (
    <>
      <PageHeader
        eyebrow="پنل برگزارکننده"
        title="حراج و جایگاه تبلیغاتی"
        desc="حراج زندهٔ نسخه‌های ویژه بخشی از بازار است؛ صف آن و حراج جایگاه‌های تبلیغاتی را اینجا مدیریت کن."
      />
      <Container className="space-y-8">
        <section className="card p-4 sm:p-6 space-y-4 anim-rise" aria-labelledby="auction-queue-title">
          <h2 id="auction-queue-title" className="text-lg font-black text-brand-navy">حراج نسخه‌های ویژه</h2>
          <p className="text-xs text-brand-slate break-words">
            هر تیم خودش نسخهٔ ویژهٔ محصولش را به صف می‌فرستد؛ در {fa(cutoffMin)} دقیقهٔ پایانی پیش از ددلاین نهایی صف بسته می‌شود.
            پایان مسابقه، حراج زندهٔ باقی‌مانده را می‌بندد.
          </p>
          <AuctionActionButtons />
          {marketStatus !== "open" && (
            <Alert kind="info">بخش بازار فعلاً باز نیست؛ شروع حراج تا بازشدن آن ممکن نیست، ولی چیدن صف آزاد است.</Alert>
          )}

          {pendingCount > 0 && (
            <Alert kind={wontFit ? "error" : "info"}>
              برآورد صف: {fa(pendingCount)} حراج باقی‌مانده × {fa(auctionDurationSec)} ثانیه ≈ {fmtDuration(estimatedSec)}
              {secondsLeft !== null && <> · زمان باقی‌مانده تا ددلاین نهایی: {fmtDuration(secondsLeft)}</>}
              {wontFit && " — با این مدت همهٔ حراج‌ها تا ددلاین جا نمی‌شوند؛ مدت هر حراج هنگام شروع به‌صورت خودکار کوتاه‌تر می‌شود تا جا شود."}
            </Alert>
          )}
          {auctions.length === 0 ? (
            <Empty title="هنوز محصولی به صف حراج نیامده" desc="تیم‌ها پس از ثبت محصول می‌توانند آن را به صف بفرستند." />
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
            هر جایگاه یک حراج است: تا شروع بازه، هر تیمی که پیشنهاد بالاتری بدهد جایگاه را می‌گیرد و سکهٔ پیشنهاد قبلی برمی‌گردد.
            بازه‌ها از {jdatetime(marketStart)} شروع می‌شوند و هر کدام {fa(slotHours)} ساعت‌اند؛ تا ددلاین نهایی برای هر بازه و هر نوع یک
            جایگاه ساخته می‌شود (ساخت دوباره بی‌خطر است و فقط کمبودها را می‌سازد).
          </p>
          <AdSlotActionButtons />

          <ul className="grid gap-3 sm:grid-cols-3">
            {slotSummary.map((s) => (
              <li key={s.kind} className="rounded-xl bg-brand-ice px-3 py-3 text-sm space-y-1">
                <div className="font-bold text-brand-navy">
                  <span aria-hidden>{AD_SLOT_KINDS[s.kind].emoji}</span> {AD_SLOT_KINDS[s.kind].label}
                </div>
                <div className="text-xs text-brand-slate">کمترین پیشنهاد: <b className="fa-num text-brand-navy">{coins(prices[s.kind])}</b></div>
                <div className="text-xs text-brand-slate">
                  دارای پیشنهاد: <b className="fa-num text-brand-navy">{fa(s.claimed)}</b> از {fa(s.total)} · باز: {fa(s.open)}
                </div>
                <div className="text-xs text-brand-slate">جمع پیشنهادها: <b className="fa-num text-brand-navy">{coins(s.revenue)}</b></div>
              </li>
            ))}
          </ul>
          <p className="text-xs text-brand-slate">کمترین پیشنهادها از تنظیمات (adslot_price_*) خوانده می‌شوند.</p>

          {slots.length === 0 ? (
            <Empty title="هنوز جایگاهی ساخته نشده" desc="با دکمهٔ بالا جایگاه‌ها را بساز." />
          ) : claimedSlots.length === 0 ? (
            <p className="text-sm text-brand-slate">هنوز پیشنهادی برای جایگاه‌ها ثبت نشده است.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[480px]">
                <caption className="sr-only">جایگاه‌های دارای پیشنهاد</caption>
                <thead>
                  <tr className="text-right text-brand-slate border-b border-brand-mist">
                    <th scope="col" className="px-3 py-2 font-bold">شروع بازه</th>
                    <th scope="col" className="px-3 py-2 font-bold">نوع</th>
                    <th scope="col" className="px-3 py-2 font-bold">تیم</th>
                    <th scope="col" className="px-3 py-2 font-bold">بالاترین پیشنهاد</th>
                  </tr>
                </thead>
                <tbody>
                  {claimedSlots.map((s) => (
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
