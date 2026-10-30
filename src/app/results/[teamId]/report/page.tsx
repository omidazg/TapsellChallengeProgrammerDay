import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { awardsFor } from "@/lib/scoring";
import { scoresForDisplay } from "@/lib/public-scores";
import { moduleVisible } from "@/lib/module-state";
import { DEFAULT_WEIGHTS, ENTRY_CATEGORY_LABEL, listAllTracks, type EntryCategory } from "@/lib/track-data";
import { formatPrizeAmount } from "@/lib/prizes";
import { entryKey } from "@/lib/economy/types";
import { productAiTag } from "@/lib/ai-tag";
import { AiTag } from "@/components/AiTag";
import { Container } from "@/components/ui";
import { fa, jdatetime } from "@/lib/persian";
import { ScoreBreakdown } from "../../ScoreBreakdown";
import { PrintButton } from "./PrintButton";

export async function generateMetadata({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { name: true } });
  return { title: team ? `گزارش پایانی · ${team.name}` : "گزارش تیم" };
}

const httpUrl = (url: string) => (/^https?:\/\//i.test(url) ? url : null);

/**
 * گزارش چاپی هر تیم (A4)، با یک بخش برای هر محوری که تیم در آن شرکت کرده. نمرهٔ داوری تا اعلام نتایج پنهان است:
 * پیش از آن فقط ادمین گزارش را می‌بیند، اعضای تیم پیام قفل می‌بینند و بقیه notFound می‌گیرند.
 */
export default async function TeamReportPage({ params }: { params: Promise<{ teamId: string }> }) {
  const user = await requireUser();
  const { teamId } = await params;
  const isPublic = await moduleVisible("results", user.teamId);
  const isMember = user.teamId === teamId;
  if (!isMember && !user.isAdmin && !isPublic) notFound();
  if (!isPublic && !user.isAdmin) {
    return (
      <Container className="py-10">
        {/* همان ظاهر Locked، ولی عنوان اصلی صفحه است و باید h1 باشد */}
        <div className="card p-10 text-center bg-brand-ice">
          <div className="text-5xl mb-3" aria-hidden>🔒</div>
          <h1 className="text-xl font-black">گزارش پایانی هنوز آماده نیست</h1>
          <p className="mt-2 text-brand-slate">ریزامتیاز تیم با اعلام نتایج منتشر می‌شود.</p>
        </div>
      </Container>
    );
  }

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      members: { select: { id: true, nickname: true } },
      ideas: { select: { trackId: true, title: true, oneLiner: true, problem: true, audience: true, buildPlan: true } },
      products: {
        select: {
          id: true,
          trackId: true,
          name: true,
          tagline: true,
          deliverableUrl: true,
          aiQuality: true,
          aiNotes: true,
          aiFinal: true,
          aiFinalNotes: true,
          liveStatus: true,
          liveUrl: true,
          bazaarStat: { select: { activeInstalls: true, revenueToman: true, rating: true, commentCount: true, flagged: true } },
        },
      },
    },
  });
  if (!team) notFound();

  const [{ output, settledAt }, tracks] = await Promise.all([scoresForDisplay(true), listAllTracks()]);
  const settled = !!settledAt;

  const entries = output.teams.filter((t) => t.teamId === teamId);
  if (entries.length === 0) notFound();

  const awards = (await awardsFor(output)).filter((a) => a.teamId === teamId);
  const trackById = new Map(tracks.map((t) => [t.id, t]));
  const trackSize = (trackId: string) => output.teams.filter((t) => t.trackId === trackId).length;

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
          {isPublic ? (
            <Link href="/results" className="text-sm text-brand-cyan-dark hover:underline">
              → بازگشت به نتایج
            </Link>
          ) : (
            <span />
          )}
          <PrintButton />
        </div>

        <header className="space-y-1 border-b border-brand-mist pb-4">
          <div className="text-xs font-bold text-brand-cyan-dark">گزارش پایانی تیم</div>
          <h1 className="text-2xl sm:text-3xl font-black text-brand-navy">{team.name}</h1>
          <p className="text-sm text-brand-slate">
            حضور در {fa(entries.length)} محور
            {settledAt && <> · ثبت نهایی در {jdatetime(settledAt)}</>}
            {!settled && <> · پیش‌نمایش (ثبت نهایی هنوز انجام نشده)</>}
          </p>
          {awards.length > 0 && (
            <p className="pt-1 flex flex-wrap gap-2">
              {awards.map((a) => (
                <span key={a.prizeId} className="chip-gold fa-num">
                  <span aria-hidden>{a.emoji}</span> {a.label} · {formatPrizeAmount(a.amountToman)}
                </span>
              ))}
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

        {entries.map((result) => {
          const track = trackById.get(result.trackId);
          const product = team.products.find((p) => p.trackId === result.trackId);
          const idea = team.ideas.find((i) => i.trackId === result.trackId);
          const aiTag = product
            ? productAiTag({ aiQuality: product.aiFinal ?? product.aiQuality, aiNotes: product.aiFinalNotes ?? product.aiNotes })
            : null;
          // لینک محصول لایو را برگزارکننده وارد می‌کند؛ فقط http(s) به‌صورت لینک نمایش داده می‌شود
          const liveUrl = product?.liveStatus === "LIVE" ? httpUrl(product.liveUrl) : null;
          const deliverableUrl = product ? httpUrl(product.deliverableUrl) : null;
          const category = result.category && track?.category === "MIXED" ? ENTRY_CATEGORY_LABEL[result.category as EntryCategory] : null;
          return (
            <section key={entryKey(result)} className="space-y-4 border-t border-brand-mist pt-6 first-of-type:border-t-0">
              <div>
                <h2 className="text-xl font-black text-brand-navy">
                  {track?.name ?? result.trackId}
                  {category && <span className="font-bold text-brand-slate"> · {category}</span>}
                </h2>
                <p className="text-sm text-brand-slate fa-num">
                  رتبهٔ {fa(result.rank ?? 0)} از {fa(trackSize(result.trackId))} در این محور · رتبهٔ کلی {fa(result.overallRank ?? 0)} · امتیاز کل{" "}
                  {fa(Math.round(result.total))}
                </p>
              </div>

              <div>
                <h3 className="font-black text-brand-navy mb-2">ریزامتیاز</h3>
                <div className="card p-0 overflow-x-auto">
                  <ScoreBreakdown
                    result={result}
                    weights={track?.weights ?? DEFAULT_WEIGHTS}
                    bazaar={product?.bazaarStat ?? null}
                    cheatNote={team.cheatNote}
                    caption={`ریزامتیاز «${team.name}» در ${track?.name ?? ""} به تفکیک معیار`}
                  />
                </div>
              </div>

              {product && (
                <div className="space-y-2 print:break-inside-avoid">
                  <h3 className="font-black text-brand-navy">محصول</h3>
                  <div className="card p-4 space-y-2 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-brand-navy">{product.name}</span>
                      {product.liveStatus === "LIVE" && <span className="chip-ok">🚀 منتشرشده روی بازار</span>}
                    </div>
                    {product.tagline && <div className="text-brand-slate">{product.tagline}</div>}
                    <AiTag tag={aiTag} />
                    {liveUrl && (
                      <a href={liveUrl} target="_blank" rel="noopener noreferrer" className="block text-brand-cyan-dark hover:underline break-all">
                        {liveUrl}
                      </a>
                    )}
                    {deliverableUrl && (
                      <a href={deliverableUrl} target="_blank" rel="noopener noreferrer" className="block text-brand-cyan-dark hover:underline break-all">
                        {deliverableUrl}
                      </a>
                    )}
                  </div>
                </div>
              )}

              {idea && (
                <div className="space-y-2 print:break-inside-avoid">
                  <h3 className="font-black text-brand-navy">ایده</h3>
                  <div className="card p-4 space-y-2 text-sm">
                    <div className="font-bold text-brand-navy">{idea.title}</div>
                    <div className="text-brand-slate">{idea.oneLiner}</div>
                    <div>
                      <span className="font-bold">مسئله: </span>
                      {idea.problem}
                    </div>
                    <div>
                      <span className="font-bold">مخاطب: </span>
                      {idea.audience}
                    </div>
                    <div>
                      <span className="font-bold">برنامهٔ ساخت: </span>
                      {idea.buildPlan}
                    </div>
                  </div>
                </div>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}
