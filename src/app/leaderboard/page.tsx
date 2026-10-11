import { prisma } from "@/lib/db";
import { getPhase } from "@/lib/phase";
import { getCurrentUser } from "@/lib/auth";
import { computeScoresCached } from "@/lib/scoring";
import { getSettledAt, loadSettledOutput } from "@/lib/settlement";
import type { TeamResult } from "@/lib/economy/types";
import { SCORE_WEIGHTS } from "@/lib/constants";
import { SCORE_CATEGORY_ORDER, SCORE_CATEGORY_LABELS } from "@/lib/score-labels";
import { PageHeader, Container, Alert, Empty } from "@/components/ui";
import { Avatar } from "@/components/Avatar";
import { fa } from "@/lib/persian";
import Link from "next/link";

export const metadata = { title: "جدول امتیازات" };

type TeamInfo = { name: string; slug: string; logoSeed: string };

export default async function LeaderboardPage() {
  // پس از ثبت نهایی، امتیازهای ثبت‌شده ملاک است تا جدول با نتایج یکی باشد.
  const settledAt = await getSettledAt();
  const [{ phase }, output, teams, viewer] = await Promise.all([
    getPhase(),
    settledAt ? loadSettledOutput() : computeScoresCached(),
    prisma.team.findMany({ select: { id: true, name: true, slug: true, logoSeed: true } }),
    getCurrentUser(),
  ]);

  const teamMap = new Map<string, TeamInfo>(teams.map((t) => [t.id, t]));
  const closed = phase === "CLOSED";

  // معیار نمایشی: پیش از پایان بازی فقط تعداد حامی (عمومی)، پس از آن امتیاز کل نهایی — همان قاعدهٔ سالن (src/lib/hall.ts).
  const metricOf = (t: TeamResult) => (closed ? t.total : t.supporters);
  const metricLabel = closed ? "امتیاز کل" : "تعداد حامی";
  const deltaUnit = closed ? "امتیاز" : "حامی";

  // پیش از پایان بازی ترتیب رتبه نباید لو برود؛ فهرست بر اساس تعداد حامی (و بعد سکهٔ دریافتی) مرتب می‌شود.
  const ranked = closed
    ? [...output.teams].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
    : [...output.teams].sort((a, b) => b.supporters - a.supporters || b.coinsReceived - a.coinsReceived);
  const podium = ranked.slice(0, 3);
  // تا وقتی هیچ تیمی امتیاز/حامی ندارد، مدال و «نزدیک‌ترین رقیب» معنایی ندارد.
  const noScores = ranked.length > 0 && ranked.every((t) => metricOf(t) === 0);

  const ownTeamId = viewer?.teamId ?? null;
  const ownIndex = ownTeamId ? ranked.findIndex((t) => t.teamId === ownTeamId) : -1;
  let nearestRival: { team?: TeamInfo; delta: number; ahead: boolean } | null = null;
  if (ownIndex >= 0 && !noScores) {
    const ownMetric = metricOf(ranked[ownIndex]);
    let best: { t: TeamResult; delta: number } | null = null;
    for (const t of ranked) {
      if (t.teamId === ownTeamId) continue;
      const delta = Math.abs(metricOf(t) - ownMetric);
      if (!best || delta < best.delta) best = { t, delta };
    }
    if (best) {
      nearestRival = { team: teamMap.get(best.t.teamId), delta: best.delta, ahead: metricOf(best.t) > ownMetric };
    }
  }

  return (
    <>
      <PageHeader eyebrow="جدول" title="جدول امتیازات میدان" desc={closed ? "نتیجهٔ نهایی مسابقه." : "وضعیت زندهٔ تیم‌ها تا پیش از پایان بازی."} />
      <Container className="space-y-10">
        {closed ? (
          <Alert kind="info">
            🏆 جوایز و گزارش کامل هر تیم در{" "}
            <Link href="/results" className="font-bold underline underline-offset-2">
              صفحهٔ نتایج
            </Link>
            .
          </Alert>
        ) : (
          <Alert kind="info">
            امتیاز کل و رتبهٔ نهایی تا «پایان بازی» پنهان است؛ تا آن موقع فقط تعداد حامی هر تیم نمایش داده می‌شود (هر کسی که با حمایت از
            ایده، خرید محصول یا برد حراج به پروژه سکه داده).
          </Alert>
        )}

        {noScores && (
          <div className="card p-6 text-center anim-rise">
            <div className="font-black text-brand-navy">هنوز رقابت شروع نشده</div>
            <p className="mt-1 text-sm text-brand-slate">
              {closed ? "هنوز امتیازی ثبت نشده است." : "هنوز هیچ تیمی حامی ندارد؛ با اولین حمایت‌ها سکوی برترها اینجا ظاهر می‌شود."}
            </p>
          </div>
        )}

        {ranked.length > 0 && !noScores && (
          <div className="grid grid-cols-3 gap-3 items-end stagger">
            {[podium[1], podium[0], podium[2]].map((t, i) =>
              t ? (
                <PodiumCard
                  key={t.teamId}
                  rank={i === 0 ? 2 : i === 1 ? 1 : 3}
                  team={teamMap.get(t.teamId)}
                  value={metricOf(t)}
                  metricLabel={metricLabel}
                  tall={i === 1}
                />
              ) : (
                <div key={i} />
              )
            )}
          </div>
        )}

        {ownTeamId && ownIndex >= 0 && (
          <div className="card p-4 flex flex-wrap items-center justify-between gap-3 anim-pop bg-brand-ice ring-2 ring-brand-red">
            <div className="flex items-center gap-2 min-w-0">
              <span className="chip-red shrink-0">تیم تو</span>
              <Avatar seed={teamMap.get(ownTeamId)?.logoSeed || ownTeamId} size={28} />
              <span className="font-bold text-brand-navy truncate">{teamMap.get(ownTeamId)?.name ?? "—"}</span>
            </div>
            {nearestRival && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-brand-slate">نزدیک‌ترین رقیب:</span>
                <Avatar seed={nearestRival.team?.logoSeed || "?"} size={24} />
                <span className="font-bold text-brand-navy">{nearestRival.team?.name ?? "—"}</span>
                <span className={`font-black fa-num ${nearestRival.ahead ? "text-brand-red" : "text-emerald-700"}`}>
                  {fa(Math.round(nearestRival.delta))} {deltaUnit} {nearestRival.ahead ? "جلوتر" : "عقب‌تر"}
                </span>
              </div>
            )}
          </div>
        )}

        {ranked.length === 0 ? (
          <Empty title="هنوز تیمی ثبت نشده" />
        ) : (
          <>
            {/* نمایش کارتی برای موبایل؛ جدول کامل فقط در md+ */}
            <div className="md:hidden space-y-3 stagger">
              {ranked.map((t) => {
                const team = teamMap.get(t.teamId);
                const isOwn = t.teamId === ownTeamId;
                return (
                  <div key={t.teamId} className={`card p-4 space-y-2 anim-rise ${isOwn ? "ring-2 ring-brand-red" : ""}`}>
                    <div className="flex items-center justify-between gap-2">
                      <TeamLink team={team} teamId={t.teamId} />
                      <div className="flex items-center gap-1.5 shrink-0">
                        {isOwn && <span className="chip-red">تیم تو</span>}
                        {closed && <span className="chip-navy fa-num">رتبه {fa(t.rank ?? 0)}</span>}
                      </div>
                    </div>
                    {closed ? (
                      <div className="grid grid-cols-2 gap-2 text-xs text-brand-slate">
                        {SCORE_CATEGORY_ORDER.map((k) => (
                          <div key={k}>
                            {SCORE_CATEGORY_LABELS[k].label}:{" "}
                            <span className="fa-num font-bold text-brand-navy">{fa(Math.round(t.pts[k]))}</span>
                          </div>
                        ))}
                        <div>
                          کسر تقلب: <span className={`fa-num font-bold ${t.cheatPenalty > 0 ? "text-brand-red" : "text-brand-navy"}`}>{t.cheatPenalty > 0 ? `−${fa(t.cheatPenalty)}` : "—"}</span>
                        </div>
                        <div className="col-span-2">
                          امتیاز کل: <span className="fa-num font-black text-brand-navy">{fa(Math.round(t.total))}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-brand-slate">
                        تعداد حامی: <span className="fa-num font-black text-brand-navy">{fa(t.supporters)}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="hidden md:block card overflow-x-auto anim-rise">
              <table className={`w-full text-sm ${closed ? "min-w-[720px]" : ""}`}>
                <caption className="sr-only">جدول امتیازات تیم‌ها</caption>
                <thead>
                  <tr className="text-right text-brand-slate border-b border-brand-mist">
                    {closed && <th scope="col" className="px-4 py-3 font-bold">رتبه</th>}
                    <th scope="col" className="px-4 py-3 font-bold">تیم</th>
                    {closed ? (
                      <>
                        {SCORE_CATEGORY_ORDER.map((k) => (
                          <th key={k} scope="col" className="px-4 py-3 font-bold whitespace-nowrap">
                            <span aria-hidden>{SCORE_CATEGORY_LABELS[k].emoji}</span> {SCORE_CATEGORY_LABELS[k].label}{" "}
                            <span className="font-normal fa-num">({fa(SCORE_WEIGHTS[k])})</span>
                          </th>
                        ))}
                        <th scope="col" className="px-4 py-3 font-bold">کسر تقلب</th>
                        <th scope="col" className="px-4 py-3 font-bold">امتیاز کل</th>
                      </>
                    ) : (
                      <th scope="col" className="px-4 py-3 font-bold">تعداد حامی</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {ranked.map((t) => {
                    const team = teamMap.get(t.teamId);
                    const isOwn = t.teamId === ownTeamId;
                    return (
                      <tr key={t.teamId} className={`border-b border-brand-mist last:border-0 ${isOwn ? "bg-brand-ice" : ""}`}>
                        {closed && <td className="px-4 py-3 font-black fa-num text-brand-navy">{fa(t.rank ?? 0)}</td>}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <TeamLink team={team} teamId={t.teamId} />
                            {isOwn && <span className="chip-red !text-xs">تیم تو</span>}
                          </div>
                        </td>
                        {closed ? (
                          <>
                            {SCORE_CATEGORY_ORDER.map((k) => (
                              <td key={k} className="px-4 py-3 fa-num">
                                {fa(Math.round(t.pts[k]))}
                                {k === "people" && <span className="block text-xs text-brand-slate">{fa(t.supporters)} حامی</span>}
                              </td>
                            ))}
                            <td className={`px-4 py-3 fa-num ${t.cheatPenalty > 0 ? "text-brand-red font-bold" : "text-brand-slate"}`}>
                              {t.cheatPenalty > 0 ? `−${fa(t.cheatPenalty)}` : "—"}
                            </td>
                            <td className="px-4 py-3 font-black fa-num text-brand-navy">{fa(Math.round(t.total))}</td>
                          </>
                        ) : (
                          <td className="px-4 py-3 fa-num font-bold text-brand-navy">{fa(t.supporters)}</td>
                        )}
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

function TeamLink({ team, teamId }: { team?: TeamInfo; teamId: string }) {
  return (
    <Link href={team ? `/market/${team.slug}` : "#"} className="flex items-center gap-2 font-bold text-brand-navy hover:text-brand-cyan-dark min-w-0">
      <Avatar seed={team?.logoSeed || teamId} size={28} />
      <span className="truncate">{team?.name ?? "—"}</span>
    </Link>
  );
}

function PodiumCard({
  rank,
  team,
  value,
  metricLabel,
  tall,
}: {
  rank: number;
  team?: TeamInfo;
  value: number;
  metricLabel: string;
  tall?: boolean;
}) {
  const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : "🥉";
  return (
    <div className={`card p-3 sm:p-4 text-center anim-pop ${tall ? "pt-8 ring-2 ring-amber-300" : ""}`}>
      <div className="text-3xl" role="img" aria-label={`رتبهٔ ${fa(rank)}`}>{medal}</div>
      <Avatar seed={team?.logoSeed || rank.toString()} size={56} className="mx-auto mt-2" />
      <div className="mt-2 font-black text-brand-navy text-sm sm:text-base leading-snug wrap-anywhere line-clamp-2">{team?.name ?? "—"}</div>
      <div className="mt-1 text-brand-red font-black fa-num">{fa(Math.round(value))}</div>
      <div className="text-xs text-brand-slate">{metricLabel}</div>
    </div>
  );
}
