import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { LEDGER_REASON_LABEL } from "@/lib/scoring";
import { spendableBuyCoins } from "@/lib/market";
import { boughtOrPendingCoins } from "@/lib/coins";
import { PageHeader, Container, Stat, Empty } from "@/components/ui";
import { fa, coins, jdatetime } from "@/lib/persian";

export const metadata = { title: "کیف سکه" };

/** جاهایی که سکه خرج می‌شود (برای راهنمای کوتاه بالای کیف) */
const SPEND_ON: { href: string; label: string }[] = [
  { href: "/invest", label: "حمایت از ایده‌ها در «دور حمایت»" },
  { href: "/market", label: "خرید محصول در «روز بازار»" },
  { href: "/auction", label: "پیشنهاد در حراج زنده" },
  { href: "/adslots", label: "خرید جایگاه تبلیغاتی" },
];

export default async function WalletPage() {
  const user = await requireUser();

  const [spendable, bought, ledger] = await Promise.all([
    // سکه‌هایی که برای پیشتازی در حراج زنده رزرو شده‌اند خرج‌پذیر نیستند.
    spendableBuyCoins(user.id, user.buyWallet),
    boughtOrPendingCoins(user.id),
    prisma.ledgerEntry.findMany({ where: { userId: user.id, wallet: "BUY" }, orderBy: { createdAt: "desc" } }),
  ]);
  const reserved = Math.max(0, user.buyWallet - spendable);

  return (
    <>
      <PageHeader
        eyebrow="کیف سکه"
        title="کیف سکهٔ تو"
        desc="همهٔ سکه‌هایت در یک کیف است: برای حمایت از ایده‌ها، خرید محصول، حراج و جایگاه تبلیغاتی."
        action={
          <Link href="/coins" className="btn-primary">
            خرید سکه
          </Link>
        }
      />
      <Container className="space-y-8">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 stagger">
          <Stat
            label="🪙 کیف سکه"
            value={coins(user.buyWallet)}
            hint={reserved > 0 ? `${coins(reserved)} رزرو در حراج زنده (پیشتازی تو)` : undefined}
            tone="gold"
          />
          <Stat label="قابل‌خرج" value={coins(spendable)} hint="همین حالا می‌توانی خرجش کنی" tone="cyan" />
          <Stat
            label="سکهٔ خریداری‌شده"
            value={coins(bought.paid)}
            hint={bought.pending > 0 ? `${coins(bought.pending)} در انتظار پرداخت` : "با پول، از صفحهٔ خرید سکه"}
            tone="navy"
          />
        </div>

        <div className="card p-6 anim-rise space-y-3">
          <h2 className="text-lg font-black text-brand-navy">سکه‌ها کجا خرج می‌شوند؟</h2>
          <ul className="flex flex-wrap gap-2">
            {SPEND_ON.map((s) => (
              <li key={s.href}>
                <Link href={s.href} className="chip-navy hover:bg-brand-mist">
                  {s.label}
                </Link>
              </li>
            ))}
          </ul>
          <p className="text-sm text-brand-slate">
            سکهٔ کم داری؟ از <Link href="/coins" className="font-bold text-brand-cyan-dark underline underline-offset-4">خرید سکه</Link> بیشتر
            بگیر؛ همهٔ پولش به صندوق جایزه می‌رود.
          </p>
        </div>

        <section>
          <h2 className="text-lg font-black text-brand-navy mb-3">تراکنش‌های من ({fa(ledger.length)})</h2>
          <LedgerTable entries={ledger} />
        </section>
      </Container>
    </>
  );
}

function LedgerTable({ entries }: { entries: { id: string; delta: number; reason: string; createdAt: Date }[] }) {
  if (entries.length === 0) return <Empty title="هنوز تراکنشی ثبت نشده" />;
  return (
    <div className="card overflow-x-auto anim-rise">
      <table className="w-full text-sm">
        <caption className="sr-only">تراکنش‌های کیف سکه</caption>
        <thead>
          <tr className="text-right text-brand-slate border-b border-brand-mist">
            <th scope="col" className="px-4 py-3 font-bold">دلیل</th>
            <th scope="col" className="px-4 py-3 font-bold">تغییر</th>
            <th scope="col" className="px-4 py-3 font-bold">زمان</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id} className="border-b border-brand-mist last:border-0">
              <td className="px-4 py-3">{LEDGER_REASON_LABEL[e.reason] ?? e.reason}</td>
              <td className="px-4 py-3">
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-black fa-num ${
                    e.delta >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-brand-red"
                  }`}
                >
                  {/* علامت منهای فارسی (U+2212) تا در متن راست‌چین وارونه دیده نشود */}
                  <span aria-hidden>{e.delta >= 0 ? "+" : "−"}</span>
                  <span className="sr-only">{e.delta >= 0 ? "افزایش" : "کاهش"}</span>
                  {fa(Math.abs(e.delta))}
                </span>
              </td>
              <td className="px-4 py-3 text-brand-slate">{jdatetime(e.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
