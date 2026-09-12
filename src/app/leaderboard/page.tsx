import { prisma } from "@/lib/db";
import { getPhase } from "@/lib/phase";
import { computeScores, topInvestors } from "@/lib/scoring";
import { PageHeader, Container, Alert, Empty } from "@/components/ui";
import { Avatar } from "@/components/Avatar";
import { fa } from "@/lib/persian";
import Link from "next/link";

export const metadata = { title: "جدول امتیازات" };

export default async function LeaderboardPage() {
  const [{ phase }, output, teams, users] = await Promise.all([
    getPhase(),
    computeScores(),
    prisma.team.findMany({ select: { id: true, name: true, slug: true, logoSeed: true } }),
    prisma.user.findMany({ select: { id: true, nickname: true, avatarSeed: true } }),
  ]);

  const teamMap = new Map(teams.map((t) => [t.id, t]));
  const userMap = new Map(users.map((u) => [u.id, u]));
  const closed = phase === "CLOSED";

  // پیش از پایان بازی حتی ترتیب رتبه هم نباید لو برود؛ فهرست بر اساس فروش خالص مرتب می‌شود.
  const ranked = closed
    ? [...output.teams].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
    : [...output.teams].sort((a, b) => b.netSales - a.netSales || b.hearts - a.hearts);
  const podium = closed ? ranked.slice(0, 3) : [];
  const investors = closed ? topInvestors(output).filter((i) => i.invested > 0).slice(0, 10) : [];

  return (
    <>
      <PageHeader eyebrow="جدول" title="جدول امتیازات میدان" desc={closed ? "نتیجهٔ نهایی مسابقه." : "وضعیت زندهٔ تیم‌ها تا پیش از پایان بازی."} />
      <Container className="space-y-10">
        {!closed && (
          <Alert kind="info">
            امتیاز کلی و رتبهٔ نهایی تا پایان بازی (فاز «پایان بازی») پنهان است؛ فقط فروش، سرمایه و قلب‌های فعلی نمایش داده می‌شود.
          </Alert>
        )}

        {closed && ranked.length > 0 && (
          <div className="grid grid-cols-3 gap-3 items-end stagger">
            {[podium[1], podium[0], podium[2]].map((t, i) =>
              t ? (
                <PodiumCard key={t.teamId} rank={t.rank ?? i + 1} team={teamMap.get(t.teamId)} total={t.total} tall={i === 1} />
              ) : (
                <div key={i} />
              )
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
                return (
                  <div key={t.teamId} className="card p-4 space-y-2 anim-rise">
                    <div className="flex items-center justify-between gap-2">
                      <Link href={team ? `/market/${team.slug}` : "#"} className="flex items-center gap-2 font-bold text-brand-navy hover:text-brand-cyan-dark min-w-0">
                        <Avatar seed={team?.logoSeed || t.teamId} size={28} />
                        <span className="truncate">{team?.name ?? "—"}</span>
                      </Link>
                      {closed && <span className="chip-navy shrink-0 fa-num">رتبه {fa(t.rank ?? 0)}</span>}
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
                <thead>
                  <tr className="text-right text-brand-slate border-b border-brand-mist">
                    {closed && <th className="px-4 py-3 font-bold">رتبه</th>}
                    <th className="px-4 py-3 font-bold">تیم</th>
                    <th className="px-4 py-3 font-bold">فروش خالص</th>
                    <th className="px-4 py-3 font-bold">سرمایهٔ خارجی</th>
                    <th className="px-4 py-3 font-bold">قلب‌ها</th>
                    {closed && (
                      <>
                        <th className="px-4 py-3 font-bold">بازده سرمایه‌گذار</th>
                        <th className="px-4 py-3 font-bold">کیفیت</th>
                        <th className="px-4 py-3 font-bold">جریمه</th>
                        <th className="px-4 py-3 font-bold">امتیاز کل</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {ranked.map((t) => {
                    const team = teamMap.get(t.teamId);
                    return (
                      <tr key={t.teamId} className="border-b border-brand-mist last:border-0">
                        {closed && <td className="px-4 py-3 font-black fa-num text-brand-navy">{fa(t.rank ?? 0)}</td>}
                        <td className="px-4 py-3">
                          <Link href={team ? `/market/${team.slug}` : "#"} className="flex items-center gap-2 font-bold text-brand-navy hover:text-brand-cyan-dark">
                            <Avatar seed={team?.logoSeed || t.teamId} size={28} />
                            {team?.name ?? "—"}
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
                  <thead>
                    <tr className="text-right text-brand-slate border-b border-brand-mist">
                      <th className="px-4 py-3 font-bold">سرمایه‌گذار</th>
                      <th className="px-4 py-3 font-bold">مجموع سرمایه‌گذاری</th>
                      <th className="px-4 py-3 font-bold">مجموع سود</th>
                      <th className="px-4 py-3 font-bold">بازده سرمایه‌گذار</th>
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

function PodiumCard({ rank, team, total, tall }: { rank: number; team?: { name: string; slug: string; logoSeed: string }; total: number; tall?: boolean }) {
  const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : "🥉";
  return (
    <div className={`card p-4 text-center anim-pop ${tall ? "pt-8 ring-2 ring-amber-300" : ""}`}>
      <div className="text-3xl">{medal}</div>
      <Avatar seed={team?.logoSeed || rank.toString()} size={56} className="mx-auto mt-2" />
      <div className="mt-2 font-black text-brand-navy truncate">{team?.name ?? "—"}</div>
      <div className="mt-1 text-brand-red font-black fa-num">{fa(Math.round(total))}</div>
    </div>
  );
}
