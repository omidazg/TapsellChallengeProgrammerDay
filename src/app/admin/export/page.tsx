import { requireAdmin } from "@/lib/auth";
import { PageHeader, Container } from "@/components/ui";

export const metadata = { title: "خروجی گزارش‌ها · پنل برگزارکننده" };

export default async function AdminExportPage() {
  await requireAdmin();

  return (
    <>
      <PageHeader eyebrow="پنل برگزارکننده" title="خروجی گزارش‌ها" desc="فایل‌های CSV برای امتیاز تیم‌ها و دفتر کل کامل." />
      <Container className="grid sm:grid-cols-2 gap-4">
        <a href="/admin/export/csv?type=teams" className="card p-6 flex items-center gap-3 hover:shadow-lift transition">
          <span className="text-2xl">📊</span>
          <div>
            <div className="font-black text-brand-navy">امتیاز تیم‌ها (CSV)</div>
            <div className="text-xs text-brand-slate">رتبه، فروش، سرمایه، ROI، کیفیت و امتیاز کل هر تیم</div>
          </div>
        </a>
        <a href="/admin/export/csv?type=ledger" className="card p-6 flex items-center gap-3 hover:shadow-lift transition">
          <span className="text-2xl">📒</span>
          <div>
            <div className="font-black text-brand-navy">دفتر کل کامل (CSV)</div>
            <div className="text-xs text-brand-slate">همهٔ تراکنش‌های کیف بذر، خرید و خزانه</div>
          </div>
        </a>
      </Container>
    </>
  );
}
