import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getPhase } from "@/lib/phase";
import { computeScoresCached, computeAwards, getAwardPicks } from "@/lib/scoring";
import { getSettledAt, loadSettledOutput } from "@/lib/settlement";
import { prizeAmountMillion } from "@/lib/prizes";
import { getPrizePoolCached } from "@/lib/prize-pool";
import { productAiTag } from "@/lib/ai-tag";
import { AiTag } from "@/components/AiTag";
import { Container } from "@/components/ui";
import { fa, jdatetime } from "@/lib/persian";
import { ScoreBreakdown, millionFa } from "../../ScoreBreakdown";
import { PrintButton } from "./PrintButton";

export async function generateMetadata({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { name: true } });
  return { title: team ? `گزارش پایانی · ${team.name}` : "گزارش تیم" };
}

/**
 * گزارش چاپی هر تیم (A4). امتیازها تا پایان بازی پنهان‌اند: پیش از فاز «پایان بازی» فقط ادمین گزارش را
 * می‌بیند، اعضای تیم پیام قفل می‌بینند و بقیه notFound می‌گیرند.
 */
export default async function TeamReportPage({ params }: { params: Promise<{ teamId: string }> }) {
  const user = await requireUser();
  const { teamId } = await params;
  const { phase } = await getPhase();
  const isPublic = phase === "CLOSED";
  const isMember = user.teamId === teamId;
  if (!isMember && !user.isAdmin && !isPublic) notFound();
  if (!isPublic && !user.isAdmin) {
    return (
      <Container className="py-10">
        {/* همان ظاهر Locked، ولی عنوان اصلی صفحه است و باید h1 باشد */}
        <div className="card p-10 text-center bg-brand-ice">
          <div className="text-5xl mb-3" aria-hidden>🔒</div>
          <h1 className="text-xl font-black">گزارش پایانی هنوز آماده نیست</h1>
          <p className="mt-2 text-brand-slate">امتیازها و ریزامتیاز تیم در فاز «پایان بازی» اعلام می‌شوند.</p>
        </div>
      </Container>
    );
  }

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      members: { select: { id: true, nickname: true } },
      idea: { select: { title: true, oneLiner: true, problem: true, audience: true, buildPlan: true } },
      product: { select: { name: true, tagline: true, aiQuality: true, aiNotes: true, liveStatus: true, liveUrl: true } },
    },
  });
  if (!team) notFound();

  const settledAt = await getSettledAt();
  const settled = !!settledAt;
  const [output, picks, pool, teamNames] = await Promise.all([
    settled ? loadSettledOutput() : computeScoresCached(),
    getAwardPicks(),
    getPrizePoolCached(),
    prisma.team.findMany({ select: { id: true, name: true } }).then((rows) => new Map(rows.map((r) => [r.id, r.name]))),
  ]);

  const result = output.teams.find((t) => t.teamId === teamId);
  if (!result) notFound();

  const award = computeAwards(output, { teamNames, picks }).find((a) => a.teamId === teamId);
  const aiTag = team.product ? productAiTag(team.product) : null;
  // لینک محصول لایو را برگزارکننده وارد می‌کند؛ فقط http(s) به‌صورت لینک نمایش داده می‌شود
  const liveUrl = team.product?.liveStatus === "LIVE" && /^https?:\/\//i.test(team.product.liveUrl) ? team.product.liveUrl : null;

  return (
    <>
      {/* اندازهٔ صفحهٔ چاپ A4 — محدود به همین صفحه، هیچ فایل CSS مشترکی تغییر نمی‌کند */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
          @page { size: A4; margin: 14mm; }
          @media print {
            body > div > header, nav, footer, .skip-link, #announcement-bar-root { display: none !important; }
            body { background: #fff !important; }
          }
        `,
        }}
      />

      <div className="mx-auto max-w-3xl px-4 sm:px-6 py-8 space-y-8 print:max-w-none print:px-0 print:py-0">
        <div className="flex flex-wrap items-start justify-between gap-4 print:hidden">
          <Link href="/results" className="text-sm text-brand-cyan-dark hover:underline">
            → بازگشت به نتایج
          </Link>
          <PrintButton />
        </div>

        <header className="space-y-1 border-b border-brand-mist pb-4">
          <div className="text-xs font-bold text-brand-cyan-dark">گزارش پایانی تیم</div>
          <h1 className="text-2xl sm:text-3xl font-black text-brand-navy">{team.name}</h1>
          <p className="text-sm text-brand-slate">
            رتبهٔ {fa(result.rank ?? 0)} از {fa(output.teams.length)} تیم · امتیاز کل {fa(Math.round(result.total))}
            {settledAt && <> · ثبت نهایی در {jdatetime(settledAt)}</>}
            {!settled && <> · پیش‌نمایش (ثبت نهایی هنوز انجام نشده)</>}
          </p>
          {award && (
            <p className="pt-1">
              <span className="chip-gold fa-num">
                <span aria-hidden>{award.emoji}</span> {award.label} — {millionFa(prizeAmountMillion(pool, award.sharePct))} میلیون تومان
              </span>
            </p>
          )}
        </header>

        <section>
          <h2 className="text-lg font-black text-brand-navy mb-2">{team.members.length <= 1 ? "شرکت فردی" : "اعضای تیم"}</h2>
          <ul className="flex flex-wrap gap-2 text-sm">
            {team.members.map((m) => (
              <li key={m.id} className="chip-navy">
                {m.nickname}
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-black text-brand-navy mb-2">ریزامتیاز</h2>
          <div className="card p-0 overflow-x-auto">
            <ScoreBreakdown result={result} cheatNote={team.cheatNote} caption={`ریزامتیاز «${team.name}» به تفکیک معیار`} />
          </div>
        </section>

        {team.product && (
          <section className="space-y-2 print:break-inside-avoid">
            <h2 className="text-lg font-black text-brand-navy">محصول</h2>
            <div className="card p-4 space-y-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold text-brand-navy">{team.product.name}</span>
                {team.product.liveStatus === "LIVE" && <span className="chip-ok">🚀 لایو</span>}
              </div>
              {team.product.tagline && <div className="text-brand-slate">{team.product.tagline}</div>}
              <AiTag tag={aiTag} />
              {liveUrl && (
                <a href={liveUrl} target="_blank" rel="noopener noreferrer" className="inline-block text-brand-cyan-dark hover:underline break-all">
                  {liveUrl}
                </a>
              )}
            </div>
          </section>
        )}

        {team.idea && (
          <section className="space-y-2 print:break-inside-avoid">
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
            </div>
          </section>
        )}
      </div>
    </>
  );
}
