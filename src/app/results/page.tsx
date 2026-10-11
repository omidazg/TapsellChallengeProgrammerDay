import dynamic from "next/dynamic";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getPhase } from "@/lib/phase";
import { computeScoresCached, computeAwards, getAwardPicks } from "@/lib/scoring";
import { getSettledAt, loadSettledOutput } from "@/lib/settlement";
import { PRIZES, prizeAmountMillion, PRIZE_POOL_BASE_MILLION_TOMAN } from "@/lib/prizes";
import { getPrizePoolCached } from "@/lib/prize-pool";
import type { TeamResult } from "@/lib/economy/types";
import { PageHeader, Container, Stat, Locked, Empty, Alert } from "@/components/ui";
import { Avatar } from "@/components/Avatar";
import { fa, coins, jdatetime } from "@/lib/persian";
import { ScoreBreakdown, juryDetail, millionFa as million } from "./ScoreBreakdown";

// کانفتی فقط برای تیم‌های برتر/برنده رندر می‌شود؛ با next/dynamic از باندل اصلی صفحهٔ نتایج جدا می‌ماند.
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
          {/* عنوان h2 پنهان تا ترتیب سرتیترها (h1 ← h2 ← h3 کارت Locked) نپرد */}
          <h2 className="sr-only">وضعیت نتایج</h2>
          <Locked title="هنوز بازی تمام نشده" desc="رتبه‌بندی، ریزامتیازها و جوایز فقط در فاز «پایان بازی» قابل مشاهده‌اند." />
        </Container>
      </>
    );
  }

  const settledAt = await getSettledAt();
  const settled = !!settledAt;

  const [output, teams, picks, pool, investments, purchases] = await Promise.all([
    settled ? loadSettledOutput() : computeScoresCached(),
    prisma.team.findMany({ select: { id: true, name: true, logoSeed: true, cheatNote: true } }),
    getAwardPicks(),
    getPrizePoolCached(),
    prisma.investment.findMany({ where: { userId: user.id, selfFunded: false }, select: { amount: true, idea: { select: { teamId: true } } } }),
    prisma.purchase.findMany({ where: { userId: user.id }, select: { amount: true, product: { select: { teamId: true } } } }),
  ]);

  const teamMap = new Map(teams.map((t) => [t.id, t]));
  const teamNames = new Map(teams.map((t) => [t.id, t.name]));
  const awards = computeAwards(output, { teamNames, picks });
  const awardByKey = new Map(awards.map((a) => [a.key, a]));

  const ranked = [...output.teams].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
  const myTeam = user.teamId ? ranked.find((t) => t.teamId === user.teamId) : undefined;
  const myAward = myTeam ? awards.find((a) => a.teamId === myTeam.teamId) : undefined;

  // سهم خودِ من در حمایت مردمی پروژه‌های دیگر (حمایت از ایده + خرید محصول و برد حراج)
  const supportedTeams = new Set<string>();
  let givenCoins = 0;
  for (const s of [...investments.map((i) => ({ amount: i.amount, teamId: i.idea.teamId })), ...purchases.map((p) => ({ amount: p.amount, teamId: p.product.teamId }))]) {
    if (s.teamId === user.teamId) continue;
    supportedTeams.add(s.teamId);
    givenCoins += s.amount;
  }

  const showConfetti = settled && !!myTeam && ((myTeam.rank ?? 99) <= 3 || !!myAward);

  return (
    <>
      {showConfetti && <Confetti />}
      <PageHeader
        eyebrow="نتایج"
        title={`نتایج بازی برای ${user.nickname}`}
        desc={settled ? "نتیجهٔ نهایی ثبت شد." : "پیش‌نمایش نتایج؛ ثبت نهایی هنوز انجام نشده است."}
      />
      <Container className="space-y-10">
        {settled ? (
          <Alert kind="ok">✅ نتیجهٔ نهایی ثبت شد{settledAt && <> (در {jdatetime(settledAt)})</>}.</Alert>
        ) : (
          <Alert kind="info">⏳ در انتظار ثبت نهایی برگزارکننده — امتیازها و جوایز زیر پیش‌نمایش‌اند و ممکن است تغییر کنند.</Alert>
        )}

        {myTeam ? (
          <section className="space-y-4">
            <h2 className="text-lg font-black text-brand-navy">تیم تو: {teamNames.get(myTeam.teamId)}</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 stagger">
              <Stat label="رتبهٔ تیم" value={`#${fa(myTeam.rank ?? 0)}`} tone="gold" />
              <Stat label="امتیاز کل" value={fa(Math.round(myTeam.total))} tone="navy" />
              <Stat label="حامیان تیم" value={fa(myTeam.supporters)} tone="cyan" />
              <Stat
                label="جایزه"
                value={myAward ? `${myAward.emoji} ${myAward.label}` : "—"}
                hint={myAward ? `${million(prizeAmountMillion(pool, myAward.sharePct))} میلیون تومان` : undefined}
                tone="red"
              />
            </div>
            <div className="card p-5 overflow-x-auto anim-rise">
              <h3 className="font-bold text-brand-navy mb-3">ریزامتیاز تیم</h3>
              <ScoreBreakdown result={myTeam} cheatNote={teamMap.get(myTeam.teamId)?.cheatNote} caption="ریزامتیاز تیم تو به تفکیک معیار" />
            </div>
          </section>
        ) : (
          <section>
            <h2 className="sr-only">تیم تو</h2>
            <Empty title="عضو هیچ تیمی نبودی" desc="امتیاز تیمی برای تو ثبت نشده است." />
          </section>
        )}

        <section className="grid sm:grid-cols-2 gap-4 stagger">
          <Stat label="پروژه‌هایی که حمایت کردی" value={fa(supportedTeams.size)} hint="با حمایت از ایده، خرید محصول یا برد حراج" tone="cyan" />
          <Stat label="سکه‌ای که به پروژه‌های دیگر دادی" value={coins(givenCoins)} tone="navy" />
        </section>

        <section>
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
            <h2 className="text-lg font-black text-brand-navy">جوایز</h2>
            <span className="chip-navy !text-xs fa-num">
              صندوق جایزه: {million(pool.totalMillion)} میلیون تومان
            </span>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 stagger">
            {PRIZES.map((p) => {
              const award = awardByKey.get(p.key);
              const pickId = p.key === "ai" ? picks.ai : p.key === "live" ? picks.live : null;
              const pending = p.how === "pick" && !pickId ? "در انتظار انتخاب داوران" : "اهدا نشد";
              const mine = !!award && award.teamId === user.teamId;
              return (
                <div key={p.key} className={`card p-5 text-center anim-pop ${mine ? "ring-2 ring-brand-red" : ""}`}>
                  <div className="text-3xl mb-2" aria-hidden>{p.emoji}</div>
                  <div className="font-black text-brand-navy">{p.label}</div>
                  <div className="mt-0.5 text-xs text-brand-slate">{p.criterion}</div>
                  <div className="mt-2 font-black text-brand-cyan-dark fa-num">
                    {million(prizeAmountMillion(pool, p.sharePct))} میلیون تومان
                    <span className="font-normal text-xs text-brand-slate"> ({fa(p.sharePct)}٪)</span>
                  </div>
                  <div className="mt-2 text-sm">
                    {award ? (
                      <Link href={`/results/${award.teamId}/report`} className="font-bold text-brand-navy hover:text-brand-cyan-dark hover:underline">
                        {award.teamName || "—"}
                      </Link>
                    ) : (
                      <span className="text-brand-slate">{pending}</span>
                    )}
                    {mine && <span className="chip-red !text-xs mr-1.5">تیم تو</span>}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-brand-slate fa-num">
            هر پروژه حداکثر یک جایزه می‌برد. صندوق = پایهٔ {million(PRIZE_POOL_BASE_MILLION_TOMAN)} + خرید سکه {million(pool.extraMillion)} میلیون تومان.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-black text-brand-navy mb-3">رتبه‌بندی نهایی همهٔ تیم‌ها</h2>
          {ranked.length === 0 ? (
            <Empty title="هیچ تیمی ثبت نشده" />
          ) : (
            <>
            {/* موبایل: فهرست کارتی (مثل جدول امتیازات)؛ جدول پهن فقط از md به بالا */}
            <ol className="md:hidden space-y-3 stagger">
              {ranked.map((t) => (
                <RankCard key={t.teamId} t={t} team={teamMap.get(t.teamId)} own={t.teamId === user.teamId} />
              ))}
            </ol>
            <div className="hidden md:block card overflow-x-auto anim-rise">
              <table className="w-full text-sm min-w-[760px]">
                <caption className="sr-only">رتبه‌بندی نهایی همهٔ تیم‌ها با ریزامتیاز سه معیار</caption>
                <thead>
                  <tr className="text-right text-brand-slate border-b border-brand-mist">
                    <th scope="col" className="px-4 py-3 font-bold">رتبه</th>
                    <th scope="col" className="px-4 py-3 font-bold">تیم</th>
                    <th scope="col" className="px-4 py-3 font-bold">🧑‍⚖️ داوری انسانی</th>
                    <th scope="col" className="px-4 py-3 font-bold">👥 حمایت مردمی</th>
                    <th scope="col" className="px-4 py-3 font-bold">🤖 هوش مصنوعی</th>
                    <th scope="col" className="px-4 py-3 font-bold">کسر تقلب</th>
                    <th scope="col" className="px-4 py-3 font-bold">امتیاز کل</th>
                  </tr>
                </thead>
                <tbody>
                  {ranked.map((t) => (
                    <RankRow key={t.teamId} t={t} team={teamMap.get(t.teamId)} own={t.teamId === user.teamId} />
                  ))}
                </tbody>
              </table>
            </div>
            </>
          )}
        </section>
      </Container>
    </>
  );
}

function RankCard({ t, team, own }: { t: TeamResult; team?: { name: string; logoSeed: string; cheatNote: string }; own: boolean }) {
  const jury = juryDetail(t);
  return (
    <li className={`card p-4 space-y-3 anim-rise ${own ? "ring-2 ring-brand-red" : ""}`}>
      <div className="flex items-center justify-between gap-2">
        <Link
          href={`/results/${t.teamId}/report`}
          className="flex items-center gap-2 min-w-0 font-bold text-brand-navy hover:text-brand-cyan-dark hover:underline"
        >
          <Avatar seed={team?.logoSeed || t.teamId} size={28} />
          <span className="truncate">{team?.name ?? "—"}</span>
        </Link>
        <div className="flex items-center gap-1.5 shrink-0">
          {own && <span className="chip-red">تیم تو</span>}
          <span className="chip-navy fa-num">رتبه {fa(t.rank ?? 0)}</span>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs text-brand-slate">
        <div>
          <dt>🧑‍⚖️ داوری انسانی</dt>
          <dd className="fa-num">
            <span className="font-bold text-sm text-brand-navy">{fa(Math.round(t.pts.jury))}</span> · {jury ?? "داوری نشده"}
          </dd>
        </div>
        <div>
          <dt>👥 حمایت مردمی</dt>
          <dd className="fa-num">
            <span className="font-bold text-sm text-brand-navy">{fa(Math.round(t.pts.people))}</span> · {fa(t.supporters)} حامی
          </dd>
        </div>
        <div>
          <dt>🤖 هوش مصنوعی</dt>
          <dd className="fa-num">
            <span className="font-bold text-sm text-brand-navy">{fa(Math.round(t.pts.ai))}</span> ·{" "}
            {t.ai == null ? "ارزیابی نشده" : `${fa(Math.round(t.ai))} از ۱۰۰`}
          </dd>
        </div>
        <div>
          <dt>کسر تقلب</dt>
          <dd className={`fa-num font-bold text-sm ${t.cheatPenalty > 0 ? "text-brand-red" : "text-brand-navy"}`}>
            {t.cheatPenalty > 0 ? `−${fa(t.cheatPenalty)}` : "—"}
          </dd>
        </div>
        {t.cheatPenalty > 0 && team?.cheatNote && (
          <div className="col-span-2 text-brand-red">
            <dt className="sr-only">دلیل کسر تقلب</dt>
            <dd>{team.cheatNote}</dd>
          </div>
        )}
        <div className="col-span-2 flex items-baseline gap-2 border-t border-brand-mist pt-2">
          <dt>امتیاز کل</dt>
          <dd className="fa-num font-black text-base text-brand-navy">{fa(Math.round(t.total))}</dd>
        </div>
      </dl>
    </li>
  );
}

function RankRow({ t, team, own }: { t: TeamResult; team?: { name: string; logoSeed: string; cheatNote: string }; own: boolean }) {
  const jury = juryDetail(t);
  return (
    <tr className={`border-b border-brand-mist last:border-0 align-top ${own ? "bg-brand-ice" : ""}`}>
      <td className="px-4 py-3 font-black fa-num text-brand-navy">{fa(t.rank ?? 0)}</td>
      <td className="px-4 py-3">
        <Link href={`/results/${t.teamId}/report`} className="flex items-center gap-2 font-bold text-brand-navy hover:text-brand-cyan-dark hover:underline">
          <Avatar seed={team?.logoSeed || t.teamId} size={26} />
          <span>{team?.name ?? "—"}</span>
          {own && <span className="chip-red !text-xs">تیم تو</span>}
        </Link>
      </td>
      <td className="px-4 py-3 fa-num">
        <div className="font-bold">{fa(Math.round(t.pts.jury))}</div>
        <div className="text-xs text-brand-slate">{jury ?? "داوری نشده"}</div>
      </td>
      <td className="px-4 py-3 fa-num">
        <div className="font-bold">{fa(Math.round(t.pts.people))}</div>
        <div className="text-xs text-brand-slate">{fa(t.supporters)} حامی</div>
      </td>
      <td className="px-4 py-3 fa-num">
        <div className="font-bold">{fa(Math.round(t.pts.ai))}</div>
        <div className="text-xs text-brand-slate">{t.ai == null ? "ارزیابی نشده" : `${fa(Math.round(t.ai))} از ۱۰۰`}</div>
      </td>
      <td className="px-4 py-3 fa-num">
        {t.cheatPenalty > 0 ? (
          <>
            <div className="font-bold text-brand-red">−{fa(t.cheatPenalty)}</div>
            {team?.cheatNote && <div className="text-xs text-brand-red max-w-[16rem]">{team.cheatNote}</div>}
          </>
        ) : (
          <span className="text-brand-slate">—</span>
        )}
      </td>
      <td className="px-4 py-3 font-black fa-num text-brand-navy">{fa(Math.round(t.total))}</td>
    </tr>
  );
}
