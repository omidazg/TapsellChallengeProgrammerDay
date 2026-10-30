import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getPhase, PHASE_LABEL } from "@/lib/phase";
import { awardsFor, computeScores } from "@/lib/scoring";
import { getSettledAt, loadSettledOutput } from "@/lib/settlement";
import { entryKey } from "@/lib/economy/types";
import { formatPrizeAmount } from "@/lib/prizes";
import { listPrizes } from "@/lib/scoring";
import { listAllTracks } from "@/lib/track-data";
import { ENTRY_CATEGORY_LABEL, type EntryCategory } from "@/lib/tracks";
import { SCORE_CATEGORY_ORDER, SCORE_CATEGORY_LABELS } from "@/lib/score-labels";
import { PageHeader, Container, Stat, Alert, Empty } from "@/components/ui";
import { fa, coins, jdatetime } from "@/lib/persian";
import { SettleButton } from "./SettleButton";
import { FinalAiButton } from "./FinalAiButton";
import { finalAiStatusAction } from "./actions";

export const metadata = { title: "تسویهٔ نهایی" };

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

export default async function AdminSettlementPage() {
  await requireAdmin();

  const [{ phase }, settledAt, teams, tracks, prizes, finalAi] = await Promise.all([
    getPhase(),
    getSettledAt(),
    prisma.team.findMany({ select: { id: true, name: true } }),
    listAllTracks(),
    listPrizes(),
    finalAiStatusAction(),
  ]);
  // پس از تسویه همان اعداد ثبت‌شده (TeamScore) نمایش داده می‌شود؛ پیش از آن، بازمحاسبهٔ زنده با نمرهٔ داوری.
  const output = settledAt ? await loadSettledOutput() : await computeScores();
  const awards = await awardsFor(output);

  const teamNames = new Map(teams.map((t) => [t.id, t.name]));
  const trackName = new Map(tracks.map((t) => [t.id, t.name]));
  const rows = output.teams;
  const totalPenalty = rows.reduce((a, t) => a + t.cheatPenalty, 0);
  const unjudged = rows.filter((t) => t.juryRaw === null).length;
  const totalPrize = prizes.reduce((a, p) => a + (p.amountToman ?? 0), 0);
  const trackList = tracks.filter((t) => rows.some((r) => r.trackId === t.id));

  return (
    <>
      <PageHeader
        eyebrow="پنل برگزارکننده"
        title="تسویهٔ نهایی"
        desc="پیش از فشردن دکمه، امتیاز هر ثبت و جوایز را بررسی کن. هر ثبت یک تیم در یک محور است."
      />
      <Container className="space-y-8">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 stagger">
          <Stat label="وضعیت مسابقه" value={PHASE_LABEL[phase]} tone="navy" />
          <Stat
            label="وضعیت تسویه"
            value={settledAt ? "تسویه شد" : "تسویه نشده"}
            hint={settledAt ? jdatetime(settledAt) : "امتیازها هنوز قفل نشده‌اند"}
            tone={settledAt ? "cyan" : "red"}
          />
          <Stat label="ثبت‌ها" value={fa(rows.length)} hint={unjudged > 0 ? `${fa(unjudged)} ثبت بدون نمرهٔ داوری` : undefined} tone="navy" />
          <Stat label="جمع جوایز" value={fa(totalPrize)} hint={`تومان · ${fa(prizes.length)} جایزه`} tone="gold" />
        </div>

        {!settledAt && phase !== "CLOSED" && (
          <Alert kind="info">
            مسابقه هنوز در جریان است. با پایان مسابقه تسویه به‌صورت خودکار اجرا می‌شود؛ اجرای دستی هم ممکن است و با پایان مسابقه
            دوباره محاسبه و جایگزین می‌شود.
          </Alert>
        )}
        {settledAt && <Alert kind="ok">تسویه در {jdatetime(settledAt)} انجام شده است. جدول زیر همان نتیجهٔ ثبت‌شده است.</Alert>}

        <section className="card p-4 sm:p-6 anim-rise space-y-4" aria-labelledby="final-ai-title">
          <h2 id="final-ai-title" className="text-lg font-black text-brand-navy">ارزیابی نهایی هوش مصنوعی</h2>
          <p className="text-sm text-brand-slate">
            هوش مصنوعی برای هر محور پارامترهای خودش را تعیین می‌کند و محصول ساخته‌شده را با آن‌ها نمره می‌دهد. با پایان مسابقه این ارزیابی
            خودکار اجرا می‌شود؛ با این دکمه می‌توانی زودتر یا دوباره اجرایش کنی.
          </p>
          <FinalAiButton initial={finalAi} />
        </section>

        <div className="card p-4 sm:p-6 anim-rise space-y-4">
          <h2 className="text-lg font-black text-brand-navy">اجرای تسویه</h2>
          <p className="text-sm text-brand-slate">
            با اجرای تسویه، امتیاز هر ثبت از سه بخش داوری، بازار و هوش مصنوعی با وزن همان محور، منهای کسر تقلب
            {totalPenalty > 0 && <> (در مجموع {fa(totalPenalty)} امتیاز)</>} ثبت می‌شود. سکه‌ای جابه‌جا نمی‌شود.
          </p>
          <SettleButton settled={!!settledAt} phaseClosed={phase === "CLOSED"} />
        </div>

        <section aria-labelledby="prizes-title">
          <h2 id="prizes-title" className="text-lg font-black text-brand-navy mb-3">
            جوایز {settledAt ? "" : "(پیش‌نمایش با امتیازهای فعلی)"}
          </h2>
          {prizes.length === 0 ? (
            <Empty title="جایزه‌ای تعریف نشده" />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {prizes.map((p) => {
                const award = awards.find((a) => a.prizeId === p.id);
                return (
                  <div key={p.id} className="card p-4 space-y-1">
                    <div className="text-sm font-black text-brand-navy break-words">
                      <span aria-hidden>{p.emoji}</span> {p.label}
                    </div>
                    <div className="text-xs text-brand-slate fa-num">
                      {trackName.get(p.trackId) ?? p.trackId} · {formatPrizeAmount(p.amountToman)}
                    </div>
                    <div className="text-sm font-bold break-words">
                      {award ? (
                        <span className="text-emerald-700">
                          {award.teamName}
                          {award.productName && <> — {award.productName}</>}
                        </span>
                      ) : (
                        <span className="text-brand-slate">{p.kind === "SPECIAL" ? "هنوز انتخاب نشده" : "—"}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="space-y-6" aria-labelledby="scores-title">
          <h2 id="scores-title" className="text-lg font-black text-brand-navy">
            {settledAt ? "امتیاز ثبت‌شدهٔ هر محور" : "پیش‌نمایش امتیاز هر محور"}
          </h2>
          {rows.length === 0 ? (
            <Empty title="هنوز ثبتی وجود ندارد" />
          ) : (
            trackList.map((track) => (
              <div key={track.id} className="space-y-2">
                <h3 className="font-black text-brand-navy">{track.name}</h3>
                {/* ناحیهٔ اسکرول افقی باید با صفحه‌کلید هم قابل فوکوس و پیمایش باشد */}
                <div className="card overflow-x-auto anim-rise" tabIndex={0} role="region" aria-label={`جدول امتیاز ${track.name} (اسکرول افقی)`}>
                  <table className="w-full text-sm min-w-[960px]">
                    <caption className="sr-only">امتیاز ثبت‌های {track.name}</caption>
                    <thead>
                      <tr className="text-right text-brand-slate border-b border-brand-mist">
                        <th scope="col" className="px-3 py-3 font-bold">رتبه</th>
                        <th scope="col" className="px-3 py-3 font-bold">تیم</th>
                        <th scope="col" className="px-3 py-3 font-bold">محصول</th>
                        <th scope="col" className="px-3 py-3 font-bold">اعضا</th>
                        <th scope="col" className="px-3 py-3 font-bold whitespace-nowrap">داوری (از ۱۰۰)</th>
                        <th scope="col" className="px-3 py-3 font-bold whitespace-nowrap">حامیان / سکه</th>
                        <th scope="col" className="px-3 py-3 font-bold whitespace-nowrap">هوش مصنوعی</th>
                        {SCORE_CATEGORY_ORDER.map((k) => (
                          <th key={k} scope="col" className="px-3 py-3 font-bold whitespace-nowrap">
                            {SCORE_CATEGORY_LABELS[k].emoji} {SCORE_CATEGORY_LABELS[k].label}
                          </th>
                        ))}
                        <th scope="col" className="px-3 py-3 font-bold text-brand-red whitespace-nowrap">کسر تقلب</th>
                        <th scope="col" className="px-3 py-3 font-bold whitespace-nowrap">امتیاز کل</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows
                        .filter((t) => t.trackId === track.id)
                        .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
                        .map((t) => (
                          <tr key={entryKey(t)} className="border-b border-brand-mist last:border-0">
                            <td className="px-3 py-2 fa-num font-black text-brand-navy">{fa(t.rank ?? 0)}</td>
                            <td className="px-3 py-2 font-bold text-brand-navy">{teamNames.get(t.teamId) ?? t.teamId}</td>
                            <td className="px-3 py-2">
                              {t.productName || "—"}
                              {t.category && (
                                <span className="text-xs text-brand-slate"> ({ENTRY_CATEGORY_LABEL[t.category as EntryCategory] ?? t.category})</span>
                              )}
                            </td>
                            <td className="px-3 py-2 fa-num">{fa(t.memberCount)}</td>
                            <td className="px-3 py-2 fa-num whitespace-nowrap">
                              {t.juryRaw === null ? <span className="text-brand-slate">داوری نشده</span> : fa(round1(t.juryRaw))}
                            </td>
                            <td className="px-3 py-2 fa-num whitespace-nowrap">
                              {fa(t.supporters)} / {coins(t.coinsReceived)}
                            </td>
                            <td className="px-3 py-2 fa-num">{t.ai === null ? <span className="text-brand-slate">—</span> : fa(round1(t.ai))}</td>
                            {SCORE_CATEGORY_ORDER.map((k) => (
                              <td key={k} className="px-3 py-2 fa-num">{fa(round1(t.pts[k]))}</td>
                            ))}
                            <td className="px-3 py-2 fa-num text-brand-red">{t.cheatPenalty > 0 ? `−${fa(t.cheatPenalty)}` : "—"}</td>
                            <td className="px-3 py-2 fa-num font-black">{fa(round1(t.total))}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          )}
        </section>
      </Container>
    </>
  );
}
