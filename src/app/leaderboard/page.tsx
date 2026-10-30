import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { scoresForDisplay } from "@/lib/public-scores";
import { getModuleStatus, moduleVisible } from "@/lib/module-state";
import { ENTRY_CATEGORY_LABEL, listVisibleTracks, type EntryCategory, type TrackInfo } from "@/lib/track-data";
import { entryKey, type TeamResult } from "@/lib/economy/types";
import { SCORE_CATEGORY_ORDER, SCORE_CATEGORY_LABELS } from "@/lib/score-labels";
import { PageHeader, Container, Alert, Empty, Locked } from "@/components/ui";
import { Avatar } from "@/components/Avatar";
import { fa } from "@/lib/persian";
import { BoardTabs, resolveBoardView } from "./BoardTabs";

export const metadata = { title: "جدول امتیازات" };

type TeamInfo = { name: string; logoSeed: string };

/** برچسب کوتاه محور و دسته که کنار هر ثبت می‌آید. */
function entryChips(t: TeamResult, trackById: Map<string, TrackInfo>, overall: boolean) {
  const chips: string[] = [];
  if (overall) chips.push(trackById.get(t.trackId)?.name ?? t.trackId);
  if (t.category && trackById.get(t.trackId)?.category === "MIXED") chips.push(ENTRY_CATEGORY_LABEL[t.category as EntryCategory]);
  return chips;
}

export default async function LeaderboardPage({ searchParams }: { searchParams: Promise<{ track?: string; cat?: string }> }) {
  const [params, viewer, tracks] = await Promise.all([searchParams, getCurrentUser(), listVisibleTracks()]);
  const ownTeamId = viewer?.teamId ?? null;

  if (!(await moduleVisible("leaderboard", ownTeamId))) {
    if ((await getModuleStatus("leaderboard")) === "hidden") notFound();
    return (
      <>
        <PageHeader eyebrow="جدول" title="جدول امتیازات" />
        <Container>
          <h2 className="sr-only">وضعیت جدول</h2>
          <Locked title="جدول امتیازات فعلاً بسته است" desc="برگزارکننده به‌زودی آن را باز می‌کند." />
        </Container>
      </>
    );
  }

  // نمرهٔ داوری فقط با اعلام نتایج به جدول اضافه می‌شود؛ بعد از آن جدول و نتایج یک عدد را نشان می‌دهند.
  const revealed = await moduleVisible("results", ownTeamId);
  const view = resolveBoardView(params, tracks);
  const [{ output }, teams, products] = await Promise.all([
    scoresForDisplay(revealed),
    prisma.team.findMany({ select: { id: true, name: true, logoSeed: true } }),
    prisma.product.findMany({ select: { id: true, slug: true } }),
  ]);

  const teamMap = new Map<string, TeamInfo>(teams.map((t) => [t.id, t]));
  const slugByProduct = new Map(products.map((p) => [p.id, p.slug]));
  const trackById = new Map(tracks.map((t) => [t.id, t]));
  const overall = !view.track;

  const ranked = output.teams
    .filter((t) => (view.track ? t.trackId === view.track.id : trackById.has(t.trackId)))
    .filter((t) => !view.category || t.category === view.category)
    .sort((a, b) => (overall ? (a.overallRank ?? 0) - (b.overallRank ?? 0) : (a.rank ?? 0) - (b.rank ?? 0)));
  // output به ترتیب رتبه است؛ در نمای دسته، رتبه جایگاه داخل همان دسته است (جایزهٔ نفر اول همین‌طور تعیین می‌شود).
  const rankOf = (t: TeamResult, i: number) => (view.category ? i + 1 : overall ? t.overallRank ?? 0 : t.rank ?? 0);

  const noScores = ranked.length > 0 && ranked.every((t) => t.total === 0);
  const podium = ranked.slice(0, 3);
  const categories = revealed ? SCORE_CATEGORY_ORDER : SCORE_CATEGORY_ORDER.filter((k) => k !== "jury");
  // سقف هر ستون فقط در جدول یک محور معنا دارد؛ وزن‌ها در هر محور فرق می‌کند.
  const weights = view.track?.weights;

  const ownEntries = ownTeamId ? ranked.filter((t) => t.teamId === ownTeamId) : [];
  const rivalOf = (own: TeamResult) => {
    let best: TeamResult | null = null;
    for (const t of ranked) {
      if (t.teamId === own.teamId || t.trackId !== own.trackId) continue;
      if (!best || Math.abs(t.total - own.total) < Math.abs(best.total - own.total)) best = t;
    }
    return best;
  };

  return (
    <>
      <PageHeader
        eyebrow="جدول"
        title={view.track ? `جدول ${view.track.name}` : "جدول امتیازات"}
        desc={revealed ? "نتیجهٔ مسابقه با نمرهٔ داوری." : "امتیاز هوش مصنوعی و بازار به‌صورت زنده."}
      />
      <Container className="space-y-10">
        <BoardTabs basePath="/leaderboard" tracks={tracks} view={view} />

        {revealed ? (
          <Alert kind="info">
            🏆 جوایز و گزارش کامل هر تیم در{" "}
            <Link href="/results" className="font-bold underline underline-offset-2">
              صفحهٔ نتایج
            </Link>
            .
          </Alert>
        ) : (
          <Alert kind="info">
            نمرهٔ داوری فقط با اعلام نتایج اضافه می‌شود، پس جمع فعلی بدون آن است و رتبه‌ها تا آن موقع می‌توانند عوض شوند.
          </Alert>
        )}

        {noScores && (
          <div className="card p-6 text-center anim-rise">
            <div className="font-black text-brand-navy">هنوز امتیازی ثبت نشده</div>
            <p className="mt-1 text-sm text-brand-slate">با اولین حمایت‌ها، ارزیابی‌های هوش مصنوعی و آمار بازار، برترها اینجا ظاهر می‌شوند.</p>
          </div>
        )}

        {ranked.length > 0 && !noScores && (
          <div className="grid grid-cols-3 gap-3 items-end stagger">
            {[podium[1], podium[0], podium[2]].map((t, i) =>
              t ? (
                <PodiumCard
                  key={entryKey(t)}
                  rank={i === 0 ? 2 : i === 1 ? 1 : 3}
                  team={teamMap.get(t.teamId)}
                  productName={t.productName}
                  value={t.total}
                  tall={i === 1}
                />
              ) : (
                <div key={i} />
              )
            )}
          </div>
        )}

        {!noScores &&
          ownEntries.map((own) => {
            const rival = rivalOf(own);
            const ahead = !!rival && rival.total > own.total;
            const rivalTeam = rival ? teamMap.get(rival.teamId) : undefined;
            return (
              <div key={entryKey(own)} className="card p-4 flex flex-wrap items-center justify-between gap-3 anim-pop bg-brand-ice ring-2 ring-brand-red">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="chip-red shrink-0">تیم تو</span>
                  <Avatar seed={teamMap.get(own.teamId)?.logoSeed || own.teamId} size={28} />
                  <span className="font-bold text-brand-navy truncate">{own.productName || teamMap.get(own.teamId)?.name || "—"}</span>
                  <span className="text-xs text-brand-slate shrink-0">{trackById.get(own.trackId)?.name}</span>
                </div>
                {rival && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-brand-slate">نزدیک‌ترین رقیب:</span>
                    <Avatar seed={rivalTeam?.logoSeed || rival.teamId} size={24} />
                    <span className="font-bold text-brand-navy">{rivalTeam?.name ?? "—"}</span>
                    <span className={`font-black fa-num ${ahead ? "text-brand-red" : "text-emerald-700"}`}>
                      {fa(Math.round(Math.abs(rival.total - own.total)))} امتیاز {ahead ? "جلوتر" : "عقب‌تر"}
                    </span>
                  </div>
                )}
              </div>
            );
          })}

        {ranked.length === 0 ? (
          <Empty title="هنوز ثبتی در این جدول نیست" desc="هر تیم با ثبت ایده در یک محور وارد جدول همان محور می‌شود." />
        ) : (
          <>
            {/* نمایش کارتی برای موبایل؛ جدول کامل فقط در md+ */}
            <div className="md:hidden space-y-3 stagger">
              {ranked.map((t, i) => {
                const isOwn = t.teamId === ownTeamId;
                return (
                  <div key={entryKey(t)} className={`card p-4 space-y-2 anim-rise ${isOwn ? "ring-2 ring-brand-red" : ""}`}>
                    <div className="flex items-center justify-between gap-2">
                      <EntryLink t={t} team={teamMap.get(t.teamId)} slug={t.productId ? slugByProduct.get(t.productId) : undefined} chips={entryChips(t, trackById, overall)} />
                      <div className="flex items-center gap-1.5 shrink-0">
                        {isOwn && <span className="chip-red">تیم تو</span>}
                        <span className="chip-navy fa-num">رتبه {fa(rankOf(t, i))}</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs text-brand-slate">
                      {categories.map((k) => (
                        <div key={k}>
                          {SCORE_CATEGORY_LABELS[k].label}: <span className="fa-num font-bold text-brand-navy">{fa(Math.round(t.pts[k]))}</span>
                        </div>
                      ))}
                      {t.cheatPenalty > 0 && (
                        <div>
                          کسر تقلب: <span className="fa-num font-bold text-brand-red">−{fa(t.cheatPenalty)}</span>
                        </div>
                      )}
                      <div className="col-span-2">
                        امتیاز کل: <span className="fa-num font-black text-brand-navy">{fa(Math.round(t.total))}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="hidden md:block card overflow-x-auto anim-rise">
              <table className="w-full text-sm min-w-[720px]">
                <caption className="sr-only">{view.track ? `جدول امتیازات ${view.track.name}` : "جدول امتیازات همهٔ محورها"}</caption>
                <thead>
                  <tr className="text-right text-brand-slate border-b border-brand-mist">
                    <th scope="col" className="px-4 py-3 font-bold">رتبه</th>
                    <th scope="col" className="px-4 py-3 font-bold">تیم و محصول</th>
                    {categories.map((k) => (
                      <th key={k} scope="col" className="px-4 py-3 font-bold whitespace-nowrap">
                        <span aria-hidden>{SCORE_CATEGORY_LABELS[k].emoji}</span> {SCORE_CATEGORY_LABELS[k].label}
                        {weights && <span className="font-normal fa-num"> ({fa(weights[k] * 10)})</span>}
                      </th>
                    ))}
                    <th scope="col" className="px-4 py-3 font-bold">کسر تقلب</th>
                    <th scope="col" className="px-4 py-3 font-bold">امتیاز کل</th>
                  </tr>
                </thead>
                <tbody>
                  {ranked.map((t, i) => {
                    const isOwn = t.teamId === ownTeamId;
                    return (
                      <tr key={entryKey(t)} className={`border-b border-brand-mist last:border-0 ${isOwn ? "bg-brand-ice" : ""}`}>
                        <td className="px-4 py-3 font-black fa-num text-brand-navy">{fa(rankOf(t, i))}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <EntryLink t={t} team={teamMap.get(t.teamId)} slug={t.productId ? slugByProduct.get(t.productId) : undefined} chips={entryChips(t, trackById, overall)} />
                            {isOwn && <span className="chip-red !text-xs shrink-0">تیم تو</span>}
                          </div>
                        </td>
                        {categories.map((k) => (
                          <td key={k} className="px-4 py-3 fa-num">
                            {fa(Math.round(t.pts[k]))}
                            {k === "market" && <span className="block text-xs text-brand-slate">{fa(t.supporters)} حامی</span>}
                          </td>
                        ))}
                        <td className={`px-4 py-3 fa-num ${t.cheatPenalty > 0 ? "text-brand-red font-bold" : "text-brand-slate"}`}>
                          {t.cheatPenalty > 0 ? `−${fa(t.cheatPenalty)}` : "—"}
                        </td>
                        <td className="px-4 py-3 font-black fa-num text-brand-navy">{fa(Math.round(t.total))}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Container>
    </>
  );
}

/** نام تیم و محصول؛ ثبتی که هنوز محصول ندارد صفحهٔ بازار هم ندارد. */
function EntryLink({ t, team, slug, chips }: { t: TeamResult; team?: TeamInfo; slug?: string; chips: string[] }) {
  const body = (
    <>
      <Avatar seed={team?.logoSeed || t.teamId} size={28} className="shrink-0" />
      <span className="min-w-0">
        <span className="block truncate">{team?.name ?? "—"}</span>
        {(t.productName || chips.length > 0) && (
          <span className="block truncate text-xs font-normal text-brand-slate">{[t.productName, ...chips].filter(Boolean).join(" · ")}</span>
        )}
      </span>
    </>
  );
  const className = "flex items-center gap-2 font-bold text-brand-navy min-w-0";
  return slug ? (
    <Link href={`/market/${slug}`} className={`${className} hover:text-brand-cyan-dark`}>
      {body}
    </Link>
  ) : (
    <span className={className}>{body}</span>
  );
}

function PodiumCard({ rank, team, productName, value, tall }: { rank: number; team?: TeamInfo; productName: string; value: number; tall?: boolean }) {
  const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : "🥉";
  return (
    <div className={`card p-3 sm:p-4 text-center anim-pop ${tall ? "pt-8 ring-2 ring-amber-300" : ""}`}>
      <div className="text-3xl" role="img" aria-label={`رتبهٔ ${fa(rank)}`}>{medal}</div>
      <Avatar seed={team?.logoSeed || rank.toString()} size={56} className="mx-auto mt-2" />
      <div className="mt-2 font-black text-brand-navy text-sm sm:text-base leading-snug wrap-anywhere line-clamp-2">{team?.name ?? "—"}</div>
      {productName && <div className="text-xs text-brand-slate wrap-anywhere line-clamp-1">{productName}</div>}
      <div className="mt-1 text-brand-red font-black fa-num">{fa(Math.round(value))}</div>
      <div className="text-xs text-brand-slate">امتیاز</div>
    </div>
  );
}
