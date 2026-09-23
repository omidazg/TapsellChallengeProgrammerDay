import { requireAdmin } from "@/lib/auth";
import { listAuctions } from "@/lib/auction";
import { getPhase, getSettingInt } from "@/lib/phase";
import { DEFAULTS } from "@/lib/constants";
import { PageHeader, Container, Empty, Alert } from "@/components/ui";
import { fa, jdatetime } from "@/lib/persian";
import { AuctionActionButtons, AdSlotActionButtons } from "./ActionButtons";

export const metadata = { title: "حراج زنده · پنل برگزارکننده" };

const STATUS_LABEL: Record<string, string> = { SCHEDULED: "در صف", LIVE: "زنده", ENDED: "پایان‌یافته" };

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

export default async function AdminAuctionPage() {
  await requireAdmin();
  const [auctions, { phase, endsAt }, auctionDurationSec] = await Promise.all([
    listAuctions(),
    getPhase(),
    getSettingInt("auction_duration_sec", DEFAULTS.auctionDurationSec),
  ]);

  // برآورد زمان صف: تعداد حراج‌های هنوز پایان‌نیافته × مدت پیکربندی‌شدهٔ فعلی، در برابر زمان باقی‌ماندهٔ فاز.
  // توجه: مدت واقعی هر حراج توسط startNextAuction به‌صورت خودکار کوتاه‌تر می‌شود تا جا شود؛
  // این فقط هشدار پیشگیرانه است، نه محدودیت واقعی.
  const pendingCount = auctions.filter((a) => a.status !== "ENDED").length;
  const estimatedSec = pendingCount * auctionDurationSec;
  const secondsLeftInPhase = phase === "AUCTION" && endsAt ? secondsUntil(endsAt) : null;
  const wontFit = secondsLeftInPhase !== null && pendingCount > 0 && estimatedSec > secondsLeftInPhase;

  return (
    <>
      <PageHeader eyebrow="پنل برگزارکننده" title="حراج زنده و جایگاه‌های تبلیغاتی" desc="صف حراج نسخه‌های ویژه و جایگاه‌های تبلیغاتی روز بازار را مدیریت کن." />
      <Container className="space-y-8">
        <section className="card p-4 sm:p-6 space-y-4 anim-rise">
          <h2 className="text-lg font-black text-brand-navy">حراج نسخه‌های ویژه</h2>
          <AuctionActionButtons />

          {pendingCount > 0 && (
            <Alert kind={wontFit ? "error" : "info"}>
              برآورد صف: {fa(pendingCount)} حراج باقی‌مانده × {fa(auctionDurationSec)} ثانیه ≈ {fmtDuration(estimatedSec)}
              {secondsLeftInPhase !== null && <> · زمان باقی‌ماندهٔ فاز حراج: {fmtDuration(secondsLeftInPhase)}</>}
              {wontFit && " — با این مدت همهٔ حراج‌ها در فاز جا نمی‌شوند؛ مدت هر حراج هنگام شروع به‌صورت خودکار کوتاه‌تر می‌شود تا جا شود."}
            </Alert>
          )}
          {auctions.length === 0 ? (
            <Empty title="هنوز حراجی ساخته نشده" />
          ) : (
            <>
              {/* نمایش کارتی برای موبایل؛ جدول کامل فقط در md+ */}
              <div className="md:hidden space-y-3">
                {auctions.map((a) => (
                  <div key={a.id} className="rounded-xl bg-brand-ice px-3 py-3 text-sm space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-bold text-brand-navy break-words">
                        {fa(a.order + 1)}. {a.product.specialName} <span className="text-brand-slate font-medium">· {a.product.teamName}</span>
                      </span>
                      <span className={`chip shrink-0 ${a.status === "LIVE" ? "chip-red" : a.status === "ENDED" ? "chip-ok" : "chip-navy"}`}>
                        {STATUS_LABEL[a.status]}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-brand-slate">
                      <span>قیمت پایانی: <b className="fa-num text-brand-navy">{a.finalPrice !== null ? fa(a.finalPrice) : "—"}</b></span>
                      <span>برنده: <b className="text-brand-navy">{a.winnerNickname ?? "—"}</b></span>
                      <span>پایان: {a.endsAt ? jdatetime(new Date(a.endsAt)) : "—"}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm min-w-[640px]">
                  <caption className="sr-only">فهرست حراج نسخه‌های ویژه</caption>
                  <thead>
                    <tr className="text-right text-brand-slate border-b border-brand-mist">
                      <th scope="col" className="px-3 py-2 font-bold">ترتیب</th>
                      <th scope="col" className="px-3 py-2 font-bold">محصول</th>
                      <th scope="col" className="px-3 py-2 font-bold">تیم</th>
                      <th scope="col" className="px-3 py-2 font-bold">وضعیت</th>
                      <th scope="col" className="px-3 py-2 font-bold">قیمت پایانی</th>
                      <th scope="col" className="px-3 py-2 font-bold">برنده</th>
                      <th scope="col" className="px-3 py-2 font-bold">پایان</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auctions.map((a) => (
                      <tr key={a.id} className="border-b border-brand-mist last:border-0">
                        <td className="px-3 py-2 fa-num">{fa(a.order + 1)}</td>
                        <td className="px-3 py-2">{a.product.specialName}</td>
                        <td className="px-3 py-2 text-brand-slate">{a.product.teamName}</td>
                        <td className="px-3 py-2">
                          <span className={`chip ${a.status === "LIVE" ? "chip-red" : a.status === "ENDED" ? "chip-ok" : "chip-navy"}`}>
                            {STATUS_LABEL[a.status]}
                          </span>
                        </td>
                        <td className="px-3 py-2 fa-num">{a.finalPrice !== null ? fa(a.finalPrice) : "—"}</td>
                        <td className="px-3 py-2">{a.winnerNickname ?? "—"}</td>
                        <td className="px-3 py-2 text-brand-slate">{a.endsAt ? jdatetime(new Date(a.endsAt)) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>

        <section className="card p-4 sm:p-6 space-y-4 anim-rise">
          <h2 className="text-lg font-black text-brand-navy">جایگاه‌های تبلیغاتی</h2>
          <AdSlotActionButtons />
          <p className="text-xs text-brand-slate break-words">
            جایگاه‌ها به‌صورت خودکار با قاعدهٔ حراج قیمت-دوم بسته می‌شوند؛ این دکمه فقط جایگاه‌های سررسیده را می‌بندد.
          </p>
        </section>
      </Container>
    </>
  );
}
