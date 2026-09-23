import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getPhase } from "@/lib/phase";
import { SCORE_WEIGHTS } from "@/lib/constants";
import { SCORE_CATEGORY_LABELS } from "@/lib/score-labels";
import { computeScoresCached } from "@/lib/scoring";
import { getSettledAt, loadSettledOutput } from "@/lib/settlement";
import { loadTimeline } from "@/lib/timeline";
import { TrendChart } from "@/components/TrendChart";
import { fa, coins, jdatetime } from "@/lib/persian";
import { PrintButton } from "./PrintButton";

export async function generateMetadata({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { name: true } });
  return { title: team ? `گزارش تیم ${team.name}` : "گزارش تیم" };
}

/**
 * گزارش چاپی هر تیم (A4). دسترسی مثل صفحهٔ نتایج: اعضای تیم و ادمین‌ها همیشه، بقیه فقط
 * وقتی نتایج عمومی است (فاز «پایان بازی»)؛ در غیر این صورت notFound برمی‌گردد.
 */
export default async function TeamReportPage({ params }: { params: Promise<{ teamId: string }> }) {
  const user = await requireUser();
  const { teamId } = await params;
  const { phase } = await getPhase();
  const isPublic = phase === "CLOSED";
  const isMember = user.teamId === teamId;
  if (!isMember && !user.isAdmin && !isPublic) notFound();

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      members: { select: { id: true, nickname: true } },
      idea: { select: { title: true, oneLiner: true, problem: true, audience: true, buildPlan: true, revenueShare: true } },
    },
  });
  if (!team) notFound();

  const settledAt = await getSettledAt();
  const settled = !!settledAt;
  const [output, timeline, teamNames] = await Promise.all([
    settled ? loadSettledOutput() : computeScoresCached(),
    loadTimeline(),
    prisma.team.findMany({ select: { id: true, name: true } }).then((rows) => new Map(rows.map((r) => [r.id, r.name]))),
  ]);

  const result = output.teams.find((t) => t.teamId === teamId);
  if (!result) notFound();

  const investorRows = output.dividends.filter((d) => d.teamId === teamId);
  const investorUsers = await prisma.user.findMany({
    where: { id: { in: investorRows.map((r) => r.userId) } },
    select: { id: true, nickname: true },
  });
  const investorNick = new Map(investorUsers.map((u) => [u.id, u.nickname]));

  const teamSeries = timeline.series.find((s) => s.teamId === teamId);

  return (
    <>
      {/* اندازهٔ صفحهٔ چاپ A4 — محدود به همین صفحه، هیچ فایل CSS مشترکی تغییر نمی‌کند */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
          @page { size: A4; margin: 14mm; }
          @media print {
            header, nav, .skip-link, [data-announcement-bar] { display: none !important; }
            body { background: #fff !important; }
          }
        `,
        }}
      />

      <div className="mx-auto max-w-3xl px-4 sm:px-6 py-8 space-y-8 print:max-w-none print:px-0 print:py-0">
        <div className="flex flex-wrap items-start justify-between gap-4 print:hidden">
          <Link href="/results" className="text-sm text-brand-cyan-dark hover:underline">
            ← بازگشت به نتایج
          </Link>
          <PrintButton />
        </div>

        <header className="space-y-1 border-b border-brand-mist pb-4">
          <div className="text-xs font-bold text-brand-cyan-dark">گزارش پایانی تیم</div>
          <h1 className="text-2xl sm:text-3xl font-black text-brand-navy">{team.name}</h1>
          <p className="text-sm text-brand-slate">
            رتبهٔ {fa(result.rank ?? 0)} از {fa(output.teams.length)} تیم
            {settledAt && <> · تسویه در {jdatetime(settledAt)}</>}
            {!settled && <> · پیش‌نمایش (هنوز تسویهٔ نهایی انجام نشده)</>}
          </p>
        </header>

        <section>
          <h2 className="text-lg font-black text-brand-navy mb-2">اعضای تیم</h2>
          <ul className="flex flex-wrap gap-2 text-sm">
            {team.members.map((m) => (
              <li key={m.id} className="chip-navy">
                {m.nickname}
              </li>
            ))}
          </ul>
        </section>

        {team.idea && (
          <section className="space-y-2">
            <h2 className="text-lg font-black text-brand-navy">ایده</h2>
            <div className="card p-4 space-y-2 text-sm">
              <div className="font-bold text-brand-navy">{team.idea.title}</div>
              <div className="text-brand-slate">{team.idea.oneLiner}</div>
              <div>
                <span className="font-bold">مسئله: </span>
                {team.idea.problem}
              </div>
              <div>
                <span className="font-bold">مخاطب: </span>
                {team.idea.audience}
              </div>
              <div>
                <span className="font-bold">برنامهٔ ساخت: </span>
                {team.idea.buildPlan}
              </div>
              <div className="fa-num">
                <span className="font-bold">سهم سرمایه‌گذار: </span>
                {fa(team.idea.revenueShare)}٪
              </div>
            </div>
          </section>
        )}

        <section>
          <h2 className="text-lg font-black text-brand-navy mb-2">ریزامتیاز</h2>
          <table className="w-full text-sm card p-0 overflow-hidden">
            <caption className="sr-only">ریزامتیاز تیم به تفکیک معیار</caption>
            <thead>
              <tr className="text-right text-brand-slate border-b border-brand-mist bg-brand-ice">
                <th scope="col" className="px-3 py-2 font-bold">معیار</th>
                <th scope="col" className="px-3 py-2 font-bold">امتیاز وزنی</th>
                <th scope="col" className="px-3 py-2 font-bold">حداکثر</th>
                <th scope="col" className="px-3 py-2 font-bold">مقدار خام</th>
              </tr>
            </thead>
            <tbody>
              <ScoreRow label={`${SCORE_CATEGORY_LABELS.sales.emoji} ${SCORE_CATEGORY_LABELS.sales.label}`} value={result.pts.sales} max={SCORE_WEIGHTS.sales} raw={coins(result.netSales)} />
              <ScoreRow label={`${SCORE_CATEGORY_LABELS.quality.emoji} ${SCORE_CATEGORY_LABELS.quality.label}`} value={result.pts.quality} max={SCORE_WEIGHTS.quality} raw={fa(Math.round(result.quality))} />
              <ScoreRow label={`${SCORE_CATEGORY_LABELS.capital.emoji} ${SCORE_CATEGORY_LABELS.capital.label}`} value={result.pts.capital} max={SCORE_WEIGHTS.capital} raw={coins(result.externalCapital)} />
              <ScoreRow label={`${SCORE_CATEGORY_LABELS.roi.emoji} ${SCORE_CATEGORY_LABELS.roi.label}`} value={result.pts.roi} max={SCORE_WEIGHTS.roi} raw={`${fa(Math.round(result.investorRoi * 100))}٪`} />
              <ScoreRow label={`${SCORE_CATEGORY_LABELS.teaser.emoji} ${SCORE_CATEGORY_LABELS.teaser.label}`} value={result.pts.teaser} max={SCORE_WEIGHTS.teaser} raw={fa(Math.round(result.teaser))} />
              <ScoreRow
                label={`${SCORE_CATEGORY_LABELS.community.emoji} ${SCORE_CATEGORY_LABELS.community.label}`}
                value={result.pts.community}
                max={SCORE_WEIGHTS.community}
                raw={`${fa(result.uniqueBuyers)} خریدار، ${fa(result.hearts)} قلب`}
              />
              <ScoreRow
                label={`${SCORE_CATEGORY_LABELS.portfolio.emoji} ${SCORE_CATEGORY_LABELS.portfolio.label}`}
                value={result.pts.portfolio}
                max={SCORE_WEIGHTS.portfolio}
                raw={coins(Math.round(result.portfolio))}
              />
              <ScoreRow
                label={`${SCORE_CATEGORY_LABELS.taste.emoji} ${SCORE_CATEGORY_LABELS.taste.label}`}
                value={result.pts.taste}
                max={SCORE_WEIGHTS.taste}
                raw={fa(Math.round(result.taste))}
              />
              <tr>
                <td className="px-3 py-2 font-bold text-brand-red">جریمهٔ خرج‌نشده</td>
                <td className="px-3 py-2 font-bold text-brand-red fa-num" colSpan={3}>
                  −{fa(Math.round(result.unspentPenalty))}
                </td>
              </tr>
              <tr className="bg-brand-ice">
                <td className="px-3 py-2 font-black text-brand-navy">امتیاز کل</td>
                <td className="px-3 py-2 font-black text-brand-navy fa-num" colSpan={3}>
                  {fa(Math.round(result.total))}
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="grid sm:grid-cols-3 gap-3 stagger">
          <div className="card p-4">
            <div className="text-xs font-bold text-brand-slate">فروش ناخالص / خالص</div>
            <div className="mt-1 font-black text-brand-navy fa-num">{coins(result.grossSales)} / {coins(result.netSales)}</div>
          </div>
          <div className="card p-4">
            <div className="text-xs font-bold text-brand-slate">سرمایهٔ خارجی / خودی</div>
            <div className="mt-1 font-black text-brand-navy fa-num">{coins(result.externalCapital)} / {coins(result.selfCapital)}</div>
          </div>
          <div className="card p-4">
            <div className="text-xs font-bold text-brand-slate">سود پرداختی به سرمایه‌گذاران</div>
            <div className="mt-1 font-black text-brand-navy fa-num">{coins(result.dividendsPaid)}</div>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-black text-brand-navy mb-2">سرمایه‌گذاران</h2>
          {investorRows.length === 0 ? (
            <p className="text-sm text-brand-slate">این تیم سرمایه‌گذار خارجی نداشت.</p>
          ) : (
            <table className="w-full text-sm card p-0 overflow-hidden">
              <caption className="sr-only">سرمایه‌گذاران تیم</caption>
              <thead>
                <tr className="text-right text-brand-slate border-b border-brand-mist bg-brand-ice">
                  <th scope="col" className="px-3 py-2 font-bold">سرمایه‌گذار</th>
                  <th scope="col" className="px-3 py-2 font-bold">مبلغ سرمایه‌گذاری</th>
                  <th scope="col" className="px-3 py-2 font-bold">سود</th>
                </tr>
              </thead>
              <tbody>
                {investorRows.map((r) => (
                  <tr key={r.userId} className="border-b border-brand-mist last:border-0">
                    <td className="px-3 py-2">{investorNick.get(r.userId) ?? r.userId}</td>
                    <td className="px-3 py-2 fa-num">{fa(r.invested)}</td>
                    <td className="px-3 py-2 fa-num text-emerald-600 font-bold">{fa(r.dividend)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {teamSeries && (
          <section className="print:break-inside-avoid">
            <h2 className="text-lg font-black text-brand-navy mb-2">روند فروش و سرمایه</h2>
            <TrendChart bucketEndsAt={timeline.bucketEndsAt} teams={[{ teamId, name: teamNames.get(teamId) ?? team.name, sales: teamSeries.sales, capital: teamSeries.capital }]} />
          </section>
        )}
      </div>
    </>
  );
}

function ScoreRow({ label, value, max, raw }: { label: string; value: number; max: number; raw: string }) {
  return (
    <tr className="border-b border-brand-mist last:border-0">
      <td className="px-3 py-2">{label}</td>
      <td className="px-3 py-2 font-bold fa-num">{fa(Math.round(value))}</td>
      <td className="px-3 py-2 text-brand-slate fa-num">{fa(max)}</td>
      <td className="px-3 py-2 text-brand-slate fa-num">{raw}</td>
    </tr>
  );
}
