import { requireAdmin } from "@/lib/auth";
import { PageHeader, Container } from "@/components/ui";

export const metadata = { title: "خروجی گزارش‌ها · پنل برگزارکننده" };

export default async function AdminExportPage() {
  await requireAdmin();

  return (
    <>
      <PageHeader eyebrow="پنل برگزارکننده" title="خروجی گزارش‌ها" desc="فایل‌های CSV برای امتیاز تیم‌ها، دفتر کل و سفارش‌های سکه، و یک خروجی کامل اکسل." />
      <Container className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <a href="/admin/export/csv?type=teams" className="card p-4 sm:p-6 flex items-center gap-3 hover:shadow-lift transition">
          <span className="text-2xl" aria-hidden>📊</span>
          <div>
            <div className="font-black text-brand-navy">امتیاز تیم‌ها (CSV)</div>
            <div className="text-xs text-brand-slate break-words">
              رتبه، اندازهٔ تیم، سه پاسخ داوری، جبران تیم کوچک، حمایت مردمی و حامیان، داوری هوش مصنوعی، امتیاز هر معیار، کسر تقلب و امتیاز کل
            </div>
          </div>
        </a>
        <a href="/admin/export/csv?type=ledger" className="card p-4 sm:p-6 flex items-center gap-3 hover:shadow-lift transition">
          <span className="text-2xl" aria-hidden>📒</span>
          <div>
            <div className="font-black text-brand-navy">دفتر کل کامل (CSV)</div>
            <div className="text-xs text-brand-slate break-words">همهٔ تراکنش‌های سکه: خرید سکه، حمایت، خرید محصول، حراج، جایگاه تبلیغاتی و تنظیم‌های برگزارکننده</div>
          </div>
        </a>
        <a href="/admin/export/csv?type=coins" className="card p-4 sm:p-6 flex items-center gap-3 hover:shadow-lift transition">
          <span className="text-2xl" aria-hidden>🪙</span>
          <div>
            <div className="font-black text-brand-navy">سفارش‌های سکه (CSV)</div>
            <div className="text-xs text-brand-slate break-words">همهٔ سفارش‌های خرید سکه با مبلغ، وضعیت، درگاه و کد پیگیری</div>
          </div>
        </a>
        <a href="/admin/export/xlsx" className="card p-4 sm:p-6 flex items-center gap-3 hover:shadow-lift transition">
          <span className="text-2xl" aria-hidden>📁</span>
          <div>
            <div className="font-black text-brand-navy">خروجی کامل اکسل (XLSX)</div>
            <div className="text-xs text-brand-slate break-words">
              تیم‌ها و امتیازها، کاربران (بدون رمز)، ایده‌ها، حمایت‌ها، خریدها، پیشنهادهای حراج، دفتر کل و سفارش‌های سکه — در یک فایل با چند شیت
            </div>
          </div>
        </a>
      </Container>
    </>
  );
}
