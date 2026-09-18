import { prisma } from "@/lib/db";
import { getPhase } from "@/lib/phase";
import { getCurrentUser } from "@/lib/auth";
import { computeScoresCached, topInvestors } from "@/lib/scoring";
import { getSettledAt, loadSettledOutput } from "@/lib/settlement";
import type { TeamResult } from "@/lib/economy/types";
import { PageHeader, Container, Alert, Empty } from "@/components/ui";
import { Avatar } from "@/components/Avatar";
import { fa } from "@/lib/persian";
import Link from "next/link";

export const metadata = { title: "جدول امتیازات" };

export default async function LeaderboardPage() {
  // پس از تسویهٔ نهایی، امتیازهای ثبت‌شده ملاک است تا جدول با نتایج پرداخت‌شده یکی باشد.
  const settledAt = await getSettledAt();
  const [{ phase }, output, teams, users, viewer] = await Promise.all([
    getPhase(),
    settledAt ? loadSettledOutput() : computeScoresCached(),
    prisma.team.findMany({ select: { id: true, name: true, slug: true, logoSeed: true } }),
    prisma.user.findMany({ select: { id: true, nickname: true, avatarSeed: true } }),
    getCurrentUser(),
  ]);

  const teamMap = new Map(teams.map((t) => [t.id, t]));
  const userMap = new Map(users.map((u) => [u.id, u]));
  const closed = phase === "CLOSED";

  // معیار نمایشی: پیش از پایان بازی فروش خالص (عمومی)، پس از آن امتیاز کل نهایی.
  const metricOf = (t: TeamResult) => (closed ? t.total : t.netSales);
  const metricLabel = closed ? "امتیاز کل" : "فروش خالص";

  // پیش از پایان بازی حتی ترتیب رتبه هم نباید لو برود؛ فهرست بر اساس فروش خالص مرتب می‌شود.
  const ranked = closed
    ? [...output.teams].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
    : [...output.teams].sort((a, b) => b.netSales - a.netSales || b.hearts - a.hearts);
  const podium = ranked.slice(0, 3);
  const investors = closed ? topInvestors(output).filter((i) => i.invested > 0).slice(0, 10) : [];

  const ownTeamId = viewer?.teamId ?? null;
  const ownIndex = ownTeamId ? ranked.findIndex((t) => t.teamId === ownTeamId) : -1;
  let nearestRival: { team?: { name: string; slug: string; logoSeed: string }; delta: number; ahead: boolean } | null = null;
  if (ownIndex >= 0) {
    const own = ranked[ownIndex];
    const ownMetric = metricOf(own);
    let best: { t: (typeof ranked)[number]; delta: number } | null = null;
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
        {!closed && (
          <Alert kind="info">
            امتیاز کلی و رتبهٔ نهایی تا پایان بازی (فاز «پایان بازی») پنهان است؛ فقط فروش، سرمایه و قلب‌های فعلی نمایش داده می‌شود.
          </Alert>
        )}

        {ranked.length > 0 && (
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
                <span className={`font-black fa-num ${nearestRival.ahead ? "text-brand-red" : "text-emerald-600"}`}>
                  {nearestRival.ahead ? `${fa(Math.round(nearestRival.delta))} جلوتر` : `${fa(Math.round(nearestRival.delta))} عقب‌تر`}
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
                      <Link href={team ? `/market/${team.slug}` : "#"} className="flex items-center gap-2 font-bold text-brand-navy hover:text-brand-cyan-dark min-w-0">
                        <Avatar seed={team?.logoSeed || t.teamId} size={28} />
                        <span className="truncate">{team?.name ?? "—"}</span>
                      </Link>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {isOwn && <span className="chip-red fa-num">تیم تو</span>}
                        {closed && <span className="chip-navy fa-num">رتبه {fa(t.rank ?? 0)}</span>}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs text-brand-slate">
                      <div>فروش خالص: <span className="fa-num font-bold text-brand-navy">{fa(t.netSales)}</span></div>
                      <div>سرمایهٔ خارجی: <span className="fa-num font-bold text-brand-navy">{fa(t.externalCapital)}</span></div>
                      <div>قلب‌ها: <span className="fa-num font-bold text-brand-navy">{fa(t.hearts)}</span></div>
                      {closed && (
                        <>
                          <div>بازده سرمایه‌گذار: <span className="fa-num font-bold text-brand-navy">{fa(Math.round(t.investorRoi * 100))}٪</span></div>
                          <div>کیفیت: <span className="fa-num font-bold text-brand-navy">{fa(Math.round(t.quality))}</span></div>
                          <div>جریمه: <span className="fa-num font-bold text-brand-red">{fa(Math.round(t.unspentPenalty))}</span></div>
                          <div>امتیاز کل: <span className="fa-num font-black text-brand-navy">{fa(Math.round(t.total))}</span></div>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="hidden md:block card overflow-x-auto anim-rise">
              <table className="w-full text-sm min-w-[640px]">
                <caption className="sr-only">جدول امتیازات تیم‌ها</caption>
                <thead>
                  <tr className="text-right text-brand-slate border-b border-brand-mist">
                    {closed && <th scope="col" className="px-4 py-3 font-bold">رتبه</th>}
                    <th scope="col" className="px-4 py-3 font-bold">تیم</th>
                    <th scope="col" className="px-4 py-3 font-bold">فروش خالص</th>
                    <th scope="col" className="px-4 py-3 font-bold">سرمایهٔ خارجی</th>
                    <th scope="col" className="px-4 py-3 font-bold">قلب‌ها</th>
                    {closed && (
                      <>
                        <th scope="col" className="px-4 py-3 font-bold">بازده سرمایه‌گذار</th>
                        <th scope="col" className="px-4 py-3 font-bold">کیفیت</th>
                        <th scope="col" className="px-4 py-3 font-bold">جریمه</th>
                        <th scope="col" className="px-4 py-3 font-bold">امتیاز کل</th>
                      </>
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
                          <Link href={team ? `/market/${team.slug}` : "#"} className="flex items-center gap-2 font-bold text-brand-navy hover:text-brand-cyan-dark">
                            <Avatar seed={team?.logoSeed || t.teamId} size={28} />
                            {team?.name ?? "—"}
                            {isOwn && <span className="chip-red !text-[11px]">تیم تو</span>}
                          </Link>
                        </td>
                        <td className="px-4 py-3 fa-num">{fa(t.netSales)}</td>
                        <td className="px-4 py-3 fa-num">{fa(t.externalCapital)}</td>
                        <td className="px-4 py-3 fa-num">{fa(t.hearts)}</td>
                        {closed && (
                          <>
                            <td className="px-4 py-3 fa-num">{fa(Math.round(t.investorRoi * 100))}٪</td>
                            <td className="px-4 py-3 fa-num">{fa(Math.round(t.quality))}</td>
                            <td className="px-4 py-3 fa-num text-brand-red">{fa(Math.round(t.unspentPenalty))}</td>
                            <td className="px-4 py-3 font-black fa-num text-brand-navy">{fa(Math.round(t.total))}</td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {closed && (
          <section>
            <h2 className="text-lg font-black text-brand-navy mb-3">سرمایه‌گذاران برتر</h2>
            {investors.length === 0 ? (
              <Empty title="سرمایه‌گذاری خارجی ثبت نشد" />
            ) : (
              <div className="card overflow-x-auto anim-rise">
                <table className="w-full text-sm min-w-[480px]">
                <caption className="sr-only">سرمایه‌گذاران برتر</caption>
                  <thead>
                    <tr className="text-right text-brand-slate border-b border-brand-mist">
                      <th scope="col" className="px-4 py-3 font-bold">سرمایه‌گذار</th>
                      <th scope="col" className="px-4 py-3 font-bold">مجموع سرمایه‌گذاری</th>
                      <th scope="col" className="px-4 py-3 font-bold">مجموع سود</th>
                      <th scope="col" className="px-4 py-3 font-bold">بازده سرمایه‌گذار</th>
                    </tr>
                  </thead>
                  <tbody>
                    {investors.map((inv) => {
                      const u = userMap.get(inv.userId);
                      return (
                        <tr key={inv.userId} className="border-b border-brand-mist last:border-0">
                          <td className="px-4 py-3 flex items-center gap-2 font-bold text-brand-navy">
                            <Avatar seed={u?.avatarSeed || inv.userId} size={26} />
                            {u?.nickname ?? "—"}
                          </td>
                          <td className="px-4 py-3 fa-num">{fa(inv.invested)}</td>
                          <td className="px-4 py-3 fa-num">{fa(inv.dividend)}</td>
                          <td className="px-4 py-3 font-black fa-num text-emerald-600">{fa(Math.round(inv.roi * 100))}٪</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </Container>
    </>
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
  team?: { name: string; slug: string; logoSeed: string };
  value: number;
  metricLabel: string;
  tall?: boolean;
}) {
  const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : "🥉";
  return (
    <div className={`card p-4 text-center anim-pop ${tall ? "pt-8 ring-2 ring-amber-300" : ""}`}>
      <div className="text-3xl">{medal}</div>
      <Avatar seed={team?.logoSeed || rank.toString()} size={56} className="mx-auto mt-2" />
      <div className="mt-2 font-black text-brand-navy truncate">{team?.name ?? "—"}</div>
      <div className="mt-1 text-brand-red font-black fa-num">{fa(Math.round(value))}</div>
      <div className="text-[11px] text-brand-slate">{metricLabel}</div>
    </div>
  );
}
