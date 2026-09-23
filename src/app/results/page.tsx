import dynamic from "next/dynamic";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getPhase } from "@/lib/phase";
import { SCORE_WEIGHTS } from "@/lib/constants";
import { SCORE_CATEGORY_ORDER, SCORE_CATEGORY_LABELS } from "@/lib/score-labels";
import { computeScoresCached, computeAwards } from "@/lib/scoring";
import { getSettledAt, loadSettledOutput } from "@/lib/settlement";
import { loadTimeline } from "@/lib/timeline";
import { TrendChart } from "@/components/TrendChart";
import { PageHeader, Container, Stat, Locked, Empty, Alert } from "@/components/ui";
import { fa, coins, jdatetime } from "@/lib/persian";

// کانفتی فقط برای ۳ تیم برتر رندر می‌شود؛ با next/dynamic از باندل اصلی صفحهٔ نتایج جدا می‌ماند.
const Confetti = dynamic(() => import("./Confetti").then((m) => m.Confetti));

export const metadata = { title: "نتایج" };

export default async function ResultsPage() {
  const user = await requireUser();
  const { phase } = await getPhase();

  if (phase !== "CLOSED") {
    return (
      <>
        <PageHeader eyebrow="نتایج" title="نتایج پایانی" desc="نتایج بعد از پایان بازی نمایش داده می‌شود." />
        <Container>
          <Locked title="هنوز بازی تمام نشده" desc="نتایج و جوایز فقط در فاز «پایان بازی» قابل مشاهده‌اند." />
        </Container>
      </>
    );
  }

  const settledAt = await getSettledAt();
  const settled = !!settledAt;

  const [output, teams, users, investments, purchases, myDividendRows, timeline] = await Promise.all([
    settled ? loadSettledOutput() : computeScoresCached(),
    prisma.team.findMany({ select: { id: true, name: true } }),
    prisma.user.findMany({ select: { id: true, nickname: true } }),
    prisma.investment.findMany({ where: { userId: user.id }, include: { idea: { include: { team: true } } } }),
    prisma.purchase.findMany({ where: { userId: user.id }, include: { product: { include: { team: true } } } }),
    prisma.ledgerEntry.findMany({ where: { userId: user.id, reason: "DIVIDEND", wallet: "BUY" } }),
    loadTimeline(),
  ]);

  const teamNames = new Map(teams.map((t) => [t.id, t.name]));
  const userNicknames = new Map(users.map((u) => [u.id, u.nickname]));
  const awards = computeAwards(output, { teamNames, userNicknames });

  const myTeam = user.teamId ? output.teams.find((t) => t.teamId === user.teamId) : undefined;
  const myDividends = output.dividends.filter((d) => d.userId === user.id);
  // سود واقعاً واریزشده = جمع سطرهای DIVIDEND دفتر کل خودِ کاربر
  const receivedDividends = myDividendRows.reduce((a, e) => a + e.delta, 0);
  const estimatedDividends = myDividends.reduce((a, d) => a + d.dividend, 0);
  // چند ردیف سرمایه‌گذاری روی یک تیم = چند خط سود؛ برای نمایش، هر تیم را یک‌جا جمع می‌کنیم
  const dividendByTeam = new Map<string, number>();
  for (const d of myDividends) dividendByTeam.set(d.teamId, (dividendByTeam.get(d.teamId) ?? 0) + d.dividend);
  const investedByIdea = new Map<string, { ideaId: string; title: string; teamId: string; teamName: string; amount: number }>();
  for (const inv of investments) {
    const cur = investedByIdea.get(inv.ideaId);
    if (cur) cur.amount += inv.amount;
    else
      investedByIdea.set(inv.ideaId, {
        ideaId: inv.ideaId,
        title: inv.idea.title,
        teamId: inv.idea.teamId,
        teamName: inv.idea.team.name,
        amount: inv.amount,
      });
  }
  const myInvestments = [...investedByIdea.values()];

  // سکهٔ فعلاً باقی‌ماندهٔ من (بذر + خرید)؛ جریمهٔ دقیق سکهٔ خرج‌نشده در سطح تیم محاسبه و
  // در myTeam.unspentPenalty نشان داده می‌شود (به «سکهٔ خرج‌شدنی» هر بازیکن روی اهداف
  // باقی‌ماندهٔ بازار وابسته است، نه فقط موجودی کیف).
  const myCoinsLeft = user.seedWallet + user.buyWallet;

  const showConfetti = settled && !!myTeam && (myTeam.rank ?? 99) <= 3;

  // فهرست کامل تیم‌ها به ترتیب رتبه، برای جدول رده‌بندی و انتخاب ۶ تیم برتر نمودار روند
  const ranked = [...output.teams].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
  const zeroSeries = new Array(timeline.bucketEndsAt.length).fill(0);
  const trendTeams = ranked.slice(0, 6).map((t) => {
    const s = timeline.series.find((ts) => ts.teamId === t.teamId);
    return { teamId: t.teamId, name: teamNames.get(t.teamId) ?? t.teamId, sales: s?.sales ?? zeroSeries, capital: s?.capital ?? zeroSeries };
  });

  return (
    <>
      {showConfetti && <Confetti />}
      <PageHeader
        eyebrow="نتایج"
        title={`نتایج بازی برای ${user.nickname}`}
        desc={settled ? "سودها پرداخت شد؛ این خلاصهٔ عملکرد توست." : "این خلاصهٔ عملکرد توست؛ تسویهٔ نهایی هنوز انجام نشده است."}
      />
      <Container className="space-y-10">
        {settled ? (
          <Alert kind="ok">
            💸 سودها پرداخت شد — سهم تو {coins(receivedDividends)} بود و به کیف خرید واریز شد.
            {settledAt && <> (تسویه در {jdatetime(settledAt)})</>}
          </Alert>
        ) : (
          <Alert kind="info">
            ⏳ در انتظار تسویهٔ نهایی برگزارکننده — امتیازها و سودهای زیر پیش‌نمایش‌اند و هنوز پرداخت نشده‌اند.
          </Alert>
        )}

        {myTeam ? (
          <section className="space-y-4">
            <h2 className="text-lg font-black text-brand-navy">تیم تو: {teamNames.get(myTeam.teamId)}</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 stagger">
              <Stat label="رتبهٔ تیم" value={`#${fa(myTeam.rank ?? 0)}`} tone="gold" />
              <Stat label="امتیاز کل" value={fa(Math.round(myTeam.total))} tone="navy" />
              <Stat label="فروش خالص" value={coins(myTeam.netSales)} tone="cyan" />
              <Stat label="سرمایهٔ خارجی" value={coins(myTeam.externalCapital)} tone="red" />
            </div>
            <div className="card p-5 overflow-x-auto anim-rise">
              <h3 className="font-bold text-brand-navy mb-3">ریزامتیاز تیم</h3>
              <table className="w-full text-sm">
                <caption className="sr-only">امتیاز تیم به تفکیک معیار</caption>
                <thead>
                  <tr className="text-right text-brand-slate border-b border-brand-mist">
                    <th scope="col" className="px-3 py-2 font-bold">معیار</th>
                    <th scope="col" className="px-3 py-2 font-bold">امتیاز</th>
                    <th scope="col" className="px-3 py-2 font-bold">حداکثر</th>
                  </tr>
                </thead>
                <tbody>
                  {SCORE_CATEGORY_ORDER.map((k) => (
                    <ScoreRow
                      key={k}
                      label={`${SCORE_CATEGORY_LABELS[k].emoji} ${SCORE_CATEGORY_LABELS[k].label}`}
                      value={myTeam.pts[k]}
                      max={SCORE_WEIGHTS[k]}
                    />
                  ))}
                  <tr>
                    <td className="px-3 py-2 font-bold text-brand-red">جریمهٔ خرج‌نشده</td>
                    <td className="px-3 py-2 font-bold text-brand-red fa-num" colSpan={2}>
                      {"−"}
                      {fa(Math.round(myTeam.unspentPenalty))}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        ) : (
          <Empty title="عضو هیچ تیمی نبودی" desc="امتیاز تیمی برای تو ثبت نشده است." />
        )}

        <section className="grid sm:grid-cols-3 gap-4 stagger">
          <Stat
            label={settled ? "سود سرمایه‌گذاری دریافتی" : "سود سرمایه‌گذاری (برآوردی)"}
            value={coins(settled ? receivedDividends : estimatedDividends)}
            hint={settled ? "واریزشده به کیف خرید" : "پس از تسویهٔ نهایی واریز می‌شود"}
            tone="cyan"
          />
          <Stat label="مجموع خرید در بازار" value={coins(purchases.reduce((a, p) => a + p.amount - p.discount, 0))} tone="red" />
          <Stat label="سکهٔ باقی‌ماندهٔ من (بذر + خرید)" value={coins(myCoinsLeft)} hint="تا پایان بازی خرجش کن تا جریمه نخوری" tone="navy" />
        </section>

        <section>
          <h2 className="text-lg font-black text-brand-navy mb-3">سرمایه‌گذاری‌های من</h2>
          {myInvestments.length === 0 ? (
            <Empty title="سرمایه‌گذاری نکردی" />
          ) : (
            <div className="card overflow-x-auto anim-rise">
              <table className="w-full text-sm">
                <caption className="sr-only">سرمایه‌گذاری‌های من</caption>
                <thead>
                  <tr className="text-right text-brand-slate border-b border-brand-mist">
                    <th scope="col" className="px-4 py-3 font-bold">ایده</th>
                    <th scope="col" className="px-4 py-3 font-bold">مبلغ</th>
                    <th scope="col" className="px-4 py-3 font-bold">{settled ? "سود دریافتی" : "سود برآوردی"}</th>
                  </tr>
                </thead>
                <tbody>
                  {myInvestments.map((inv) => {
                    const div = dividendByTeam.get(inv.teamId) ?? 0;
                    return (
                      <tr key={inv.ideaId} className="border-b border-brand-mist last:border-0">
                        <td className="px-4 py-3">{inv.title} <span className="text-brand-slate text-xs">({inv.teamName})</span></td>
                        <td className="px-4 py-3 fa-num">{fa(inv.amount)}</td>
                        <td className="px-4 py-3 fa-num text-emerald-600 font-bold">{fa(div)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section>
          <h2 className="text-lg font-black text-brand-navy mb-3">خریدهای من</h2>
          {purchases.length === 0 ? (
            <Empty title="خریدی ثبت نشده" />
          ) : (
            <div className="card overflow-x-auto anim-rise">
              <table className="w-full text-sm">
                <caption className="sr-only">خریدهای من</caption>
                <thead>
                  <tr className="text-right text-brand-slate border-b border-brand-mist">
                    <th scope="col" className="px-4 py-3 font-bold">محصول</th>
                    <th scope="col" className="px-4 py-3 font-bold">تیم</th>
                    <th scope="col" className="px-4 py-3 font-bold">مبلغ پرداختی</th>
                  </tr>
                </thead>
                <tbody>
                  {purchases.map((p) => (
                    <tr key={p.id} className="border-b border-brand-mist last:border-0">
                      <td className="px-4 py-3">{p.product.name}</td>
                      <td className="px-4 py-3 text-brand-slate">{p.product.team.name}</td>
                      <td className="px-4 py-3 fa-num">{fa(p.amount - p.discount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section>
          <h2 className="text-lg font-black text-brand-navy mb-3">رتبه‌بندی نهایی همهٔ تیم‌ها</h2>
          <div className="card overflow-x-auto anim-rise">
            <table className="w-full text-sm min-w-[560px]">
              <caption className="sr-only">رتبه‌بندی نهایی همهٔ تیم‌ها</caption>
              <thead>
                <tr className="text-right text-brand-slate border-b border-brand-mist">
                  <th scope="col" className="px-4 py-3 font-bold">رتبه</th>
                  <th scope="col" className="px-4 py-3 font-bold">تیم</th>
                  <th scope="col" className="px-4 py-3 font-bold">فروش خالص</th>
                  <th scope="col" className="px-4 py-3 font-bold">سرمایهٔ خارجی</th>
                  <th scope="col" className="px-4 py-3 font-bold">امتیاز کل</th>
                  <th scope="col" className="px-4 py-3 font-bold">گزارش</th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((t) => (
                  <tr key={t.teamId} className={`border-b border-brand-mist last:border-0 ${t.teamId === user.teamId ? "bg-brand-ice" : ""}`}>
                    <td className="px-4 py-3 font-black fa-num text-brand-navy">{fa(t.rank ?? 0)}</td>
                    <td className="px-4 py-3 font-bold text-brand-navy">{teamNames.get(t.teamId) ?? t.teamId}</td>
                    <td className="px-4 py-3 fa-num">{fa(t.netSales)}</td>
                    <td className="px-4 py-3 fa-num">{fa(t.externalCapital)}</td>
                    <td className="px-4 py-3 font-black fa-num">{fa(Math.round(t.total))}</td>
                    <td className="px-4 py-3">
                      <Link href={`/results/${t.teamId}/report`} className="text-brand-cyan-dark hover:underline font-bold">
                        مشاهدهٔ گزارش
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-black text-brand-navy mb-3">روند بازار</h2>
          <TrendChart bucketEndsAt={timeline.bucketEndsAt} teams={trendTeams} />
        </section>

        <section>
          <h2 className="text-lg font-black text-brand-navy mb-3">جوایز میدان</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 stagger">
            {awards.map((a) => (
              <div key={a.key} className="card p-5 text-center anim-pop">
                <div className="text-3xl mb-2">{a.emoji}</div>
                <div className="font-black text-brand-navy">{a.label}</div>
                <div className="mt-1 text-sm text-brand-slate">{a.teamName || a.userNickname}</div>
              </div>
            ))}
          </div>
        </section>
      </Container>
    </>
  );
}

function ScoreRow({ label, value, max }: { label: string; value: number; max: number }) {
  return (
    <tr className="border-b border-brand-mist last:border-0">
      <td className="px-3 py-2">{label}</td>
      <td className="px-3 py-2 font-bold fa-num">{fa(Math.round(value))}</td>
      <td className="px-3 py-2 text-brand-slate fa-num">{fa(max)}</td>
    </tr>
  );
}
