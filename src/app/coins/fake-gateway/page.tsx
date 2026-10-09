import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { fakePaymentAllowed } from "@/lib/coins";
import { Container, Alert } from "@/components/ui";
import { fa, coins } from "@/lib/persian";

export const metadata = { title: "درگاه پرداخت آزمایشی", robots: { index: false, follow: false } };

/**
 * درگاه پرداخت آزمایشی (درایور fake): فقط در توسعه یا با PAYMENT_FAKE_ALLOWED=1.
 * پیوندها عمداً <a> ساده‌اند نه next/link، تا prefetch خودکار نتیجهٔ پرداخت را از پیش ثبت نکند.
 */
export default async function FakeGatewayPage({ searchParams }: { searchParams: Promise<{ authority?: string }> }) {
  if (!fakePaymentAllowed()) notFound();
  const authority = String((await searchParams).authority ?? "");
  const order = authority
    ? await prisma.coinOrder.findUnique({ where: { gateway_authority: { gateway: "fake", authority } } })
    : null;
  if (!order) notFound();

  const back = (status: "OK" | "NOK") =>
    `/coins/callback?gateway=fake&authority=${encodeURIComponent(authority)}&status=${status}`;

  return (
    <Container className="max-w-lg pt-10">
      <div className="card p-6 sm:p-8 space-y-5 border-2 border-dashed border-amber-300 anim-rise">
        <div className="text-center space-y-2">
          <div className="text-5xl" aria-hidden>
            🧪
          </div>
          <h1 className="text-2xl font-black text-brand-navy">درگاه پرداخت آزمایشی</h1>
          <span className="chip-gold">فقط برای تست — هیچ پولی جابه‌جا نمی‌شود</span>
        </div>

        <dl className="rounded-2xl bg-brand-ice p-4 space-y-2 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-brand-slate">سفارش</dt>
            <dd className="font-black text-brand-navy fa-num">{coins(order.coins)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-brand-slate">مبلغ</dt>
            <dd className="font-black text-brand-navy fa-num">
              {fa(order.amountRial)} ریال ({fa(order.amountRial / 10)} تومان)
            </dd>
          </div>
        </dl>

        {order.status === "PENDING" ? (
          <div className="flex flex-col sm:flex-row gap-3">
            <a href={back("OK")} className="btn-primary flex-1 justify-center">
              پرداخت موفق (آزمایشی)
            </a>
            <a href={back("NOK")} className="btn-ghost flex-1 justify-center">
              انصراف
            </a>
          </div>
        ) : (
          <>
            <Alert kind="info">این سفارش دیگر در انتظار پرداخت نیست.</Alert>
            <a href="/coins" className="btn-ghost w-full justify-center">
              بازگشت به خرید سکه
            </a>
          </>
        )}
      </div>
    </Container>
  );
}
