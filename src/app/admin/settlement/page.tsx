import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getPhase, PHASE_LABEL } from "@/lib/phase";
import { computeScores } from "@/lib/scoring";
import { getSettledAt } from "@/lib/settlement";
import { PageHeader, Container, Stat, Alert, Empty } from "@/components/ui";
import { fa, coins, jdatetime } from "@/lib/persian";
import { SettleButton } from "./SettleButton";

export const metadata = { title: "تسویهٔ نهایی" };

export default async function AdminSettlementPage() {
  await requireAdmin();

  const [{ phase }, settledAt, output, teams] = await Promise.all([
    getPhase(),
    getSettledAt(),
    computeScores(),
    prisma.team.findMany({ select: { id: true, name: true } }),
  ]);
  const users = await prisma.user.findMany({ select: { id: true, nickname: true } });

  const teamNames = new Map(teams.map((t) => [t.id, t.name]));
  const userNicknames = new Map(users.map((u) => [u.id, u.nickname]));

  const previewDividends = output.dividends.filter((d) => d.dividend > 0);
  const previewTotal = previewDividends.reduce((a, d) => a + d.dividend, 0);
  const totalPenalty = output.teams.reduce((a, t) => a + t.unspentPenalty, 0);

  const paidAgg = settledAt
    ? await prisma.ledgerEntry.aggregate({
        where: { reason: "DIVIDEND", wallet: "BUY" },
        _sum: { delta: true },
        _count: true,
      })
    : null;

  return (
    <>
      <PageHeader
        eyebrow="پنل برگزارکننده"
        title="تسویهٔ نهایی"
        desc="پیش از فشردن دکمه، پیش‌نمایش امتیازها و سود سرمایه‌گذاران را بررسی کن. تسویه فقط یک‌بار انجام می‌شود."
      />
      <Container className="space-y-8">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 stagger">
          <Stat label="فاز جاری" value={PHASE_LABEL[phase]} tone="navy" />
          <Stat
            label="وضعیت تسویه"
            value={settledAt ? "تسویه شد" : "تسویه نشده"}
            hint={settledAt ? jdatetime(settledAt) : "هنوز سودی پرداخت نشده است"}
            tone={settledAt ? "cyan" : "red"}
          />
          <Stat label="تیم‌های میدان" value={fa(output.teams.length)} tone="navy" />
          <Stat
            label={settledAt ? "سود پرداخت‌شده" : "سود قابل پرداخت (پیش‌نمایش)"}
            value={coins(settledAt ? paidAgg?._sum.delta ?? 0 : previewTotal)}
            hint={settledAt ? `${fa(paidAgg?._count ?? 0)} سطر دفتر کل` : `${fa(previewDividends.length)} سرمایه‌گذار`}
            tone="gold"
          />
        </div>

        {!settledAt && phase !== "CLOSED" && (
          <Alert kind="info">
            هنوز در فاز «{PHASE_LABEL[phase]}» هستیم. با رفتن به فاز «پایان بازی» تسویه به‌صورت خودکار اجرا می‌شود؛
            اجرای دستی هم ممکن است ولی مقادیر پس از آن قفل می‌شوند.
          </Alert>
        )}
        {settledAt && (
          <Alert kind="ok">
            تسویهٔ نهایی در {jdatetime(settledAt)} انجام شده است. جدول زیر فقط یک بازمحاسبهٔ نمایشی است و روی نتایج ثبت‌شده اثری ندارد.
          </Alert>
        )}

        <div className="card p-6 anim-rise space-y-4">
          <h2 className="text-lg font-black text-brand-navy">اجرای تسویه</h2>
          <p className="text-sm text-brand-slate">
            با اجرای تسویه: سود هر سرمایه‌گذار خارجی به کیف خرید او واریز و در دفتر کل ثبت می‌شود،
            جریمهٔ سکهٔ خرج‌نشدهٔ هر تیم (در این پیش‌نمایش {fa(Math.round(totalPenalty * 10) / 10)} امتیاز)
            در نتیجهٔ تیم ثبت می‌گردد و امتیاز همهٔ تیم‌ها قفل می‌شود.
          </p>
          <SettleButton settled={!!settledAt} />
        </div>

        <section>
          <h2 className="text-lg font-black text-brand-navy mb-3">پیش‌نمایش امتیاز تیم‌ها</h2>
          {output.teams.length === 0 ? (
            <Empty title="هنوز تیمی ثبت نشده" />
          ) : (
            <div className="card overflow-x-auto anim-rise">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-right text-brand-slate border-b border-brand-mist">
                    <th className="px-4 py-3 font-bold">رتبه</th>
                    <th className="px-4 py-3 font-bold">تیم</th>
                    <th className="px-4 py-3 font-bold">فروش ناخالص</th>
                    <th className="px-4 py-3 font-bold">سود پرداختی</th>
                    <th className="px-4 py-3 font-bold">فروش خالص</th>
                    <th className="px-4 py-3 font-bold">سرمایهٔ خارجی</th>
                    <th className="px-4 py-3 font-bold">جریمهٔ خرج‌نشده</th>
                    <th className="px-4 py-3 font-bold">امتیاز کل</th>
                  </tr>
                </thead>
                <tbody>
                  {output.teams.map((t) => (
                    <tr key={t.teamId} className="border-b border-brand-mist last:border-0">
                      <td className="px-4 py-3 fa-num font-black text-brand-navy">{fa(t.rank ?? 0)}</td>
                      <td className="px-4 py-3">{teamNames.get(t.teamId) ?? t.teamId}</td>
                      <td className="px-4 py-3 fa-num">{fa(t.grossSales)}</td>
                      <td className="px-4 py-3 fa-num">{fa(t.dividendsPaid)}</td>
                      <td className="px-4 py-3 fa-num">{fa(t.netSales)}</td>
                      <td className="px-4 py-3 fa-num">{fa(t.externalCapital)}</td>
                      <td className="px-4 py-3 fa-num text-brand-red">
                        {"−"}
                        {fa(Math.round(t.unspentPenalty * 10) / 10)}
                      </td>
                      <td className="px-4 py-3 fa-num font-black">{fa(Math.round(t.total))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section>
          <h2 className="text-lg font-black text-brand-navy mb-3">پیش‌نمایش سود سرمایه‌گذاران</h2>
          {previewDividends.length === 0 ? (
            <Empty title="سودی برای پرداخت نیست" desc="هیچ سرمایه‌گذاری خارجی با سود مثبت وجود ندارد." />
          ) : (
            <div className="card overflow-x-auto anim-rise">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-right text-brand-slate border-b border-brand-mist">
                    <th className="px-4 py-3 font-bold">سرمایه‌گذار</th>
                    <th className="px-4 py-3 font-bold">تیم سرمایه‌پذیر</th>
                    <th className="px-4 py-3 font-bold">سرمایه</th>
                    <th className="px-4 py-3 font-bold">سود</th>
                  </tr>
                </thead>
                <tbody>
                  {previewDividends.map((d) => (
                    <tr key={`${d.userId}-${d.teamId}`} className="border-b border-brand-mist last:border-0">
                      <td className="px-4 py-3">{userNicknames.get(d.userId) ?? d.userId}</td>
                      <td className="px-4 py-3 text-brand-slate">{teamNames.get(d.teamId) ?? d.teamId}</td>
                      <td className="px-4 py-3 fa-num">{fa(d.invested)}</td>
                      <td className="px-4 py-3 fa-num font-black text-emerald-600">{fa(d.dividend)}</td>
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
