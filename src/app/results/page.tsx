import dynamic from "next/dynamic";
import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { awardsFor, listPrizes } from "@/lib/scoring";
import { scoresForDisplay } from "@/lib/public-scores";
import { getModuleStatus, moduleVisible } from "@/lib/module-state";
import { DEFAULT_WEIGHTS, ENTRY_CATEGORY_LABEL, listVisibleTracks, type EntryCategory, type TrackInfo } from "@/lib/track-data";
import { formatPrizeAmount, type Award } from "@/lib/prizes";
import { entryKey, type TeamResult } from "@/lib/economy/types";
import { SCORE_CATEGORY_LABELS } from "@/lib/score-labels";
import { PageHeader, Container, Stat, Locked, Empty, Alert } from "@/components/ui";
import { Avatar } from "@/components/Avatar";
import { fa, coins, jdatetime } from "@/lib/persian";
import { BoardTabs, resolveBoardView } from "../leaderboard/BoardTabs";
import { ScoreBreakdown, juryDetail } from "./ScoreBreakdown";

// کانفتی فقط برای تیم‌های برتر/برنده رندر می‌شود؛ با next/dynamic از باندل اصلی صفحهٔ نتایج جدا می‌ماند.
const Confetti = dynamic(() => import("./Confetti").then((m) => m.Confetti));

export const metadata = { title: "نتایج" };

type TeamInfo = { name: string; logoSeed: string; cheatNote: string };

function entryLine(t: TeamResult, trackById: Map<string, TrackInfo>, overall: boolean): string {
  const parts = [t.productName];
  if (overall) parts.push(trackById.get(t.trackId)?.name ?? t.trackId);
  if (t.category && trackById.get(t.trackId)?.category === "MIXED") parts.push(ENTRY_CATEGORY_LABEL[t.category as EntryCategory]);
  return parts.filter(Boolean).join(" · ");
}

export default async function ResultsPage({ searchParams }: { searchParams: Promise<{ track?: string; cat?: string }> }) {
  const [params, user, tracks] = await Promise.all([searchParams, requireUser(), listVisibleTracks()]);

  if (!(await moduleVisible("results", user.teamId))) {
    if ((await getModuleStatus("results")) === "hidden") notFound();
    return (
      <>
        <PageHeader eyebrow="نتایج" title="نتایج و برندگان" desc="نتایج را برگزارکننده اعلام می‌کند." />
        <Container>
          {/* عنوان h2 پنهان تا ترتیب سرتیترها (h1 ← h2 ← h3 کارت Locked) نپرد */}
          <h2 className="sr-only">وضعیت نتایج</h2>
          <Locked title="نتایج هنوز اعلام نشده" desc="رتبه‌بندی با نمرهٔ داوری، ریزامتیازها و برندگان جوایز بعد از اعلام نتایج اینجا می‌آید." />
        </Container>
      </>
    );
  }

  const { output, settledAt } = await scoresForDisplay(true);
  const settled = !!settledAt;

  const [teams, awards, prizes, investments, purchases, myStats] = await Promise.all([
    prisma.team.findMany({ select: { id: true, name: true, logoSeed: true, cheatNote: true } }),
    awardsFor(output),
    listPrizes(),
    prisma.investment.findMany({ where: { userId: user.id, selfFunded: false }, select: { amount: true, idea: { select: { teamId: true, trackId: true } } } }),
    prisma.purchase.findMany({ where: { userId: user.id }, select: { amount: true, product: { select: { teamId: true, trackId: true } } } }),
    user.teamId
      ? prisma.bazaarStat.findMany({
          where: { product: { teamId: user.teamId } },
          select: { productId: true, activeInstalls: true, revenueToman: true, rating: true, commentCount: true, flagged: true },
        })
      : [],
  ]);

  const view = resolveBoardView(params, tracks);
  const overall = !view.track;
  const teamMap = new Map<string, TeamInfo>(teams.map((t) => [t.id, t]));
  const trackById = new Map(tracks.map((t) => [t.id, t]));
  const statsByProduct = new Map(myStats.map((s) => [s.productId, s]));
  // جایزه مال محصول است؛ جایزهٔ ویژه می‌تواند از محور دیگری به این محصول رسیده باشد.
  const awardsOf = (t: TeamResult): Award[] => (t.productId ? awards.filter((a) => a.productId === t.productId) : []);
  const awardByPrize = new Map(awards.map((a) => [a.prizeId, a]));

  const ranked = output.teams
    .filter((t) => (view.track ? t.trackId === view.track.id : trackById.has(t.trackId)))
    .filter((t) => !view.category || t.category === view.category)
    .sort((a, b) => (overall ? (a.overallRank ?? 0) - (b.overallRank ?? 0) : (a.rank ?? 0) - (b.rank ?? 0)));
  const rankOf = (t: TeamResult, i: number) => (view.category ? i + 1 : overall ? t.overallRank ?? 0 : t.rank ?? 0);

  const myEntries = user.teamId ? output.teams.filter((t) => t.teamId === user.teamId && trackById.has(t.trackId)) : [];
  const shownPrizes = prizes.filter(
    (p) => trackById.has(p.trackId) && (!view.track || p.trackId === view.track.id) && (!view.category || !p.category || p.category === view.category)
  );

  // سهم خودِ من در حمایت پروژه‌های دیگر (حمایت از ایده + خرید محصول و برد حراج)
  const supportedEntries = new Set<string>();
  let givenCoins = 0;
  for (const s of [...investments.map((i) => ({ amount: i.amount, ...i.idea })), ...purchases.map((p) => ({ amount: p.amount, ...p.product }))]) {
    if (s.teamId === user.teamId) continue;
    supportedEntries.add(entryKey(s));
    givenCoins += s.amount;
  }

  const showConfetti = settled && myEntries.some((t) => (t.rank ?? 99) <= 3 || awardsOf(t).length > 0);

  return (
    <>
      {showConfetti && <Confetti />}
      <PageHeader
        eyebrow="نتایج"
        title={`نتایج مسابقه برای ${user.nickname}`}
        desc={settled ? "نتیجهٔ نهایی ثبت شد." : "پیش‌نمایش نتایج؛ ثبت نهایی هنوز انجام نشده است."}
      />
      <Container className="space-y-10">
        {settled ? (
          <Alert kind="ok">✅ نتیجهٔ نهایی ثبت شد{settledAt && <> (در {jdatetime(settledAt)})</>}.</Alert>
        ) : (
          <Alert kind="info">⏳ در انتظار ثبت نهایی برگزارکننده؛ امتیازها و جوایز زیر پیش‌نمایش‌اند و ممکن است تغییر کنند.</Alert>
        )}

        {myEntries.length > 0 ? (
          myEntries.map((t) => {
            const mine = awardsOf(t);
            const track = trackById.get(t.trackId);
            const stat = t.productId ? statsByProduct.get(t.productId) : undefined;
            return (
              <section key={entryKey(t)} className="space-y-4">
                <h2 className="text-lg font-black text-brand-navy">
                  {teamMap.get(t.teamId)?.name} · {track?.name}
                  {t.productName && <span className="font-bold text-brand-slate"> · {t.productName}</span>}
                </h2>
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 stagger">
                  <Stat label="رتبه در محور" value={`#${fa(t.rank ?? 0)}`} hint={`رتبهٔ کلی #${fa(t.overallRank ?? 0)}`} tone="gold" />
                  <Stat label="امتیاز کل" value={fa(Math.round(t.total))} tone="navy" />
                  <Stat label="حامیان" value={fa(t.supporters)} tone="cyan" />
                  <Stat
                    label="جایزه"
                    value={mine.length > 0 ? mine.map((a) => `${a.emoji} ${a.label}`).join("، ") : "—"}
                    hint={mine.length > 0 ? mine.map((a) => formatPrizeAmount(a.amountToman)).join(" + ") : undefined}
                    tone="red"
                  />
                </div>
                <div className="card p-5 overflow-x-auto anim-rise">
                  <h3 className="font-bold text-brand-navy mb-3">ریزامتیاز</h3>
                  <ScoreBreakdown
                    result={t}
                    weights={track?.weights ?? DEFAULT_WEIGHTS}
                    bazaar={stat ?? null}
                    cheatNote={teamMap.get(t.teamId)?.cheatNote}
                    caption={`ریزامتیاز ${track?.name ?? ""} به تفکیک معیار`}
                  />
                </div>
              </section>
            );
          })
        ) : (
          <section>
            <h2 className="sr-only">تیم تو</h2>
            <Empty title={user.teamId ? "تیمت در هیچ محوری ثبت ندارد" : "عضو هیچ تیمی نبودی"} desc="امتیازی برای تو ثبت نشده است." />
          </section>
        )}

        <section className="grid sm:grid-cols-2 gap-4 stagger">
          <Stat label="پروژه‌هایی که حمایت کردی" value={fa(supportedEntries.size)} hint="با حمایت از ایده، خرید محصول یا برد حراج" tone="cyan" />
          <Stat label="سکه‌ای که به پروژه‌های دیگر دادی" value={coins(givenCoins)} tone="navy" />
        </section>

        <BoardTabs basePath="/results" tracks={tracks} view={view} />

        <section>
          <h2 className="text-lg font-black text-brand-navy mb-3">جوایز</h2>
          {shownPrizes.length === 0 ? (
            <Empty title="جایزه‌ای برای این جدول تعریف نشده" />
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 stagger">
              {shownPrizes.map((p) => {
                const award = awardByPrize.get(p.id);
                const mine = !!award && award.teamId === user.teamId;
                const pending = p.kind === "SPECIAL" && !p.winnerProductId ? "در انتظار انتخاب کمیته" : "اهدا نشد";
                return (
                  <div key={p.id} className={`card p-5 text-center anim-pop ${mine ? "ring-2 ring-brand-red" : ""}`}>
                    <div className="text-3xl mb-2" aria-hidden>{p.emoji}</div>
                    <div className="font-black text-brand-navy">{p.label}</div>
                    <div className="mt-0.5 text-xs text-brand-slate">
                      {trackById.get(p.trackId)?.name}
                      {p.kind === "SPECIAL" && " · جایزهٔ ویژه"}
                    </div>
                    <div className="mt-2 font-black text-brand-cyan-dark fa-num">{formatPrizeAmount(p.amountToman)}</div>
                    <div className="mt-2 text-sm">
                      {award ? (
                        <Link href={`/results/${award.teamId}/report`} className="font-bold text-brand-navy hover:text-brand-cyan-dark hover:underline">
                          {award.teamName || "—"}
                          {award.productName && <span className="font-normal text-brand-slate"> · {award.productName}</span>}
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
          )}
          <p className="mt-3 text-xs text-brand-slate">هر محصول حداکثر یک جایزهٔ رتبه و یک جایزهٔ ویژه می‌برد.</p>
        </section>

        <section>
          <h2 className="text-lg font-black text-brand-navy mb-3">
            {view.track ? `رتبه‌بندی ${view.track.name}` : "رتبه‌بندی کلی همهٔ محورها"}
            {view.category && ` · ${ENTRY_CATEGORY_LABEL[view.category]}`}
          </h2>
          {ranked.length === 0 ? (
            <Empty title="ثبتی در این جدول نیست" />
          ) : (
            <>
              {/* موبایل: فهرست کارتی (مثل جدول امتیازات)؛ جدول پهن فقط از md به بالا */}
              <ol className="md:hidden space-y-3 stagger">
                {ranked.map((t, i) => (
                  <RankCard key={entryKey(t)} t={t} rank={rankOf(t, i)} line={entryLine(t, trackById, overall)} team={teamMap.get(t.teamId)} own={t.teamId === user.teamId} />
                ))}
              </ol>
              <div className="hidden md:block card overflow-x-auto anim-rise">
                <table className="w-full text-sm min-w-[760px]">
                  <caption className="sr-only">رتبه‌بندی با ریزامتیاز داوری، بازار و هوش مصنوعی</caption>
                  <thead>
                    <tr className="text-right text-brand-slate border-b border-brand-mist">
                      <th scope="col" className="px-4 py-3 font-bold">رتبه</th>
                      <th scope="col" className="px-4 py-3 font-bold">تیم و محصول</th>
                      <th scope="col" className="px-4 py-3 font-bold">{SCORE_CATEGORY_LABELS.jury.emoji} {SCORE_CATEGORY_LABELS.jury.label}</th>
                      <th scope="col" className="px-4 py-3 font-bold">{SCORE_CATEGORY_LABELS.market.emoji} {SCORE_CATEGORY_LABELS.market.label}</th>
                      <th scope="col" className="px-4 py-3 font-bold">{SCORE_CATEGORY_LABELS.ai.emoji} {SCORE_CATEGORY_LABELS.ai.label}</th>
                      <th scope="col" className="px-4 py-3 font-bold">کسر تقلب</th>
                      <th scope="col" className="px-4 py-3 font-bold">امتیاز کل</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ranked.map((t, i) => (
                      <RankRow key={entryKey(t)} t={t} rank={rankOf(t, i)} line={entryLine(t, trackById, overall)} team={teamMap.get(t.teamId)} own={t.teamId === user.teamId} />
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

type RankProps = { t: TeamResult; rank: number; line: string; team?: TeamInfo; own: boolean };

function RankCard({ t, rank, line, team, own }: RankProps) {
  const jury = juryDetail(t);
  return (
    <li className={`card p-4 space-y-3 anim-rise ${own ? "ring-2 ring-brand-red" : ""}`}>
      <div className="flex items-center justify-between gap-2">
        <Link
          href={`/results/${t.teamId}/report`}
          className="flex items-center gap-2 min-w-0 font-bold text-brand-navy hover:text-brand-cyan-dark hover:underline"
        >
          <Avatar seed={team?.logoSeed || t.teamId} size={28} className="shrink-0" />
          <span className="min-w-0">
            <span className="block truncate">{team?.name ?? "—"}</span>
            {line && <span className="block truncate text-xs font-normal text-brand-slate">{line}</span>}
          </span>
        </Link>
        <div className="flex items-center gap-1.5 shrink-0">
          {own && <span className="chip-red">تیم تو</span>}
          <span className="chip-navy fa-num">رتبه {fa(rank)}</span>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs text-brand-slate">
        <div>
          <dt>{SCORE_CATEGORY_LABELS.jury.emoji} {SCORE_CATEGORY_LABELS.jury.label}</dt>
          <dd className="fa-num">
            <span className="font-bold text-sm text-brand-navy">{fa(Math.round(t.pts.jury))}</span> · {jury ?? "داوری نشده"}
          </dd>
        </div>
        <div>
          <dt>{SCORE_CATEGORY_LABELS.market.emoji} {SCORE_CATEGORY_LABELS.market.label}</dt>
          <dd className="fa-num">
            <span className="font-bold text-sm text-brand-navy">{fa(Math.round(t.pts.market))}</span> · {fa(t.supporters)} حامی
          </dd>
        </div>
        <div>
          <dt>{SCORE_CATEGORY_LABELS.ai.emoji} {SCORE_CATEGORY_LABELS.ai.label}</dt>
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

function RankRow({ t, rank, line, team, own }: RankProps) {
  const jury = juryDetail(t);
  return (
    <tr className={`border-b border-brand-mist last:border-0 align-top ${own ? "bg-brand-ice" : ""}`}>
      <td className="px-4 py-3 font-black fa-num text-brand-navy">{fa(rank)}</td>
      <td className="px-4 py-3">
        <Link href={`/results/${t.teamId}/report`} className="flex items-center gap-2 font-bold text-brand-navy hover:text-brand-cyan-dark hover:underline">
          <Avatar seed={team?.logoSeed || t.teamId} size={26} className="shrink-0" />
          <span className="min-w-0">
            <span className="block">{team?.name ?? "—"}</span>
            {line && <span className="block text-xs font-normal text-brand-slate">{line}</span>}
          </span>
          {own && <span className="chip-red !text-xs">تیم تو</span>}
        </Link>
      </td>
      <td className="px-4 py-3 fa-num">
        <div className="font-bold">{fa(Math.round(t.pts.jury))}</div>
        <div className="text-xs text-brand-slate">{jury ?? "داوری نشده"}</div>
      </td>
      <td className="px-4 py-3 fa-num">
        <div className="font-bold">{fa(Math.round(t.pts.market))}</div>
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
