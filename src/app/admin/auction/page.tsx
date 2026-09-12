import { requireAdmin } from "@/lib/auth";
import { listAuctions } from "@/lib/auction";
import { PageHeader, Container, Empty } from "@/components/ui";
import { fa, jdatetime } from "@/lib/persian";
import { AuctionActionButtons, AdSlotActionButtons } from "./ActionButtons";

export const metadata = { title: "حراج زنده · پنل برگزارکننده" };

const STATUS_LABEL: Record<string, string> = { SCHEDULED: "در صف", LIVE: "زنده", ENDED: "پایان‌یافته" };

export default async function AdminAuctionPage() {
  await requireAdmin();
  const auctions = await listAuctions();

  return (
    <>
      <PageHeader eyebrow="پنل برگزارکننده" title="حراج زنده و جایگاه‌های تبلیغاتی" desc="صف حراج نسخه‌های ویژه و جایگاه‌های تبلیغاتی روز بازار را مدیریت کن." />
      <Container className="space-y-8">
        <section className="card p-6 space-y-4 anim-rise">
          <h2 className="text-lg font-black text-brand-navy">حراج نسخه‌های ویژه</h2>
          <AuctionActionButtons />
          {auctions.length === 0 ? (
            <Empty title="هنوز حراجی ساخته نشده" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-right text-brand-slate border-b border-brand-mist">
                    <th className="px-3 py-2 font-bold">ترتیب</th>
                    <th className="px-3 py-2 font-bold">محصول</th>
                    <th className="px-3 py-2 font-bold">تیم</th>
                    <th className="px-3 py-2 font-bold">وضعیت</th>
                    <th className="px-3 py-2 font-bold">قیمت پایانی</th>
                    <th className="px-3 py-2 font-bold">برنده</th>
                    <th className="px-3 py-2 font-bold">پایان</th>
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
          )}
        </section>

        <section className="card p-6 space-y-4 anim-rise">
          <h2 className="text-lg font-black text-brand-navy">جایگاه‌های تبلیغاتی</h2>
          <AdSlotActionButtons />
          <p className="text-xs text-brand-slate">
            جایگاه‌ها به‌صورت خودکار با قاعدهٔ حراج قیمت-دوم بسته می‌شوند؛ این دکمه فقط جایگاه‌های سررسیده را می‌بندد.
          </p>
        </section>
      </Container>
    </>
  );
}
