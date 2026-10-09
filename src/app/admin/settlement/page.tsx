import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getPhase, PHASE_LABEL } from "@/lib/phase";
import { computeAwards, computeScores, getAwardPicks } from "@/lib/scoring";
import { getSettledAt, loadSettledOutput } from "@/lib/settlement";
import { getPrizePool } from "@/lib/prize-pool";
import { PRIZES, formatMillion, prizeAmountMillion } from "@/lib/prizes";
import { SCORE_WEIGHTS } from "@/lib/constants";
import { SCORE_CATEGORY_ORDER, SCORE_CATEGORY_LABELS } from "@/lib/score-labels";
import { PageHeader, Container, Stat, Alert, Empty } from "@/components/ui";
import { fa, coins, jdatetime } from "@/lib/persian";
import { SettleButton } from "./SettleButton";

export const metadata = { title: "تسویهٔ نهایی" };

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

export default async function AdminSettlementPage() {
  await requireAdmin();

  const [{ phase }, settledAt, teams, pool, picks] = await Promise.all([
    getPhase(),
    getSettledAt(),
    prisma.team.findMany({ select: { id: true, name: true } }),
    getPrizePool(),
    getAwardPicks(),
  ]);
  // پس از تسویه همان اعداد ثبت‌شده (TeamScore) نمایش داده می‌شود؛ پیش از آن، بازمحاسبهٔ زنده.
  const output = settledAt ? await loadSettledOutput() : await computeScores();

  const teamNames = new Map(teams.map((t) => [t.id, t.name]));
  const rows = [...output.teams].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
  const awards = computeAwards(output, { teamNames, picks });
  const totalPenalty = rows.reduce((a, t) => a + t.cheatPenalty, 0);
  const unjudged = rows.filter((t) => t.juryRaw === null).length;

  return (
    <>
      <PageHeader
        eyebrow="پنل برگزارکننده"
        title="تسویهٔ نهایی"
        desc="پیش از فشردن دکمه، امتیاز سه‌معیارهٔ تیم‌ها و جوایز را بررسی کن. تسویه فقط یک‌بار انجام می‌شود."
      />
      <Container className="space-y-8">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 stagger">
          <Stat label="فاز جاری" value={PHASE_LABEL[phase]} tone="navy" />
          <Stat
            label="وضعیت تسویه"
            value={settledAt ? "تسویه شد" : "تسویه نشده"}
            hint={settledAt ? jdatetime(settledAt) : "امتیازها هنوز قفل نشده‌اند"}
            tone={settledAt ? "cyan" : "red"}
          />
          <Stat label="تیم‌های میدان" value={fa(rows.length)} hint={unjudged > 0 ? `${fa(unjudged)} تیم بدون نمرهٔ داوری` : undefined} tone="navy" />
          <Stat
            label="صندوق جایزه"
            value={fa(formatMillion(pool.totalMillion))}
            hint={`میلیون تومان · ${fa(formatMillion(pool.extraMillion))} میلیون از خرید سکه`}
            tone="gold"
          />
        </div>

        {!settledAt && phase !== "CLOSED" && (
          <Alert kind="info">
            هنوز در فاز «{PHASE_LABEL[phase]}» هستیم. با رفتن به فاز «پایان بازی» تسویه به‌صورت خودکار اجرا می‌شود؛
            اجرای دستی هم ممکن است ولی امتیازها پس از آن قفل می‌شوند.
          </Alert>
        )}
        {settledAt && (
          <Alert kind="ok">
            تسویهٔ نهایی در {jdatetime(settledAt)} انجام شده است. جدول زیر همان نتیجهٔ ثبت‌شده است.
          </Alert>
        )}

        <div className="card p-4 sm:p-6 anim-rise space-y-4">
          <h2 className="text-lg font-black text-brand-navy">اجرای تسویه</h2>
          <p className="text-sm text-brand-slate">
            با اجرای تسویه، امتیاز هر تیم از سه معیار (داوری انسانی {fa(SCORE_WEIGHTS.jury)}، حمایت مردمی {fa(SCORE_WEIGHTS.people)} و
            داوری هوش مصنوعی {fa(SCORE_WEIGHTS.ai)} امتیاز) منهای کسر تقلب
            {totalPenalty > 0 && <> (در مجموع {fa(totalPenalty)} امتیاز)</>} ثبت و قفل می‌شود. سکه‌ای جابه‌جا نمی‌شود.
            انتخاب جوایز داوران در{" "}
            <Link href="/admin/jury#award-picks" className="font-bold text-brand-cyan-dark hover:underline">داوری و جوایز</Link>{" "}
            پس از تسویه هم قابل تغییر است.
          </p>
          <SettleButton settled={!!settledAt} phaseClosed={phase === "CLOSED"} />
        </div>

        <section aria-labelledby="prizes-title">
          <h2 id="prizes-title" className="text-lg font-black text-brand-navy mb-3">
            جوایز {settledAt ? "" : "(پیش‌نمایش با امتیازهای فعلی)"}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {PRIZES.map((p) => {
              const award = awards.find((a) => a.key === p.key);
              return (
                <div key={p.key} className="card p-4 space-y-1">
                  <div className="text-sm font-black text-brand-navy">
                    <span aria-hidden>{p.emoji}</span> {p.label}
                  </div>
                  <div className="text-xs text-brand-slate fa-num">
                    {fa(p.sharePct)}٪ · {fa(formatMillion(prizeAmountMillion(pool, p.sharePct)))} میلیون تومان
                  </div>
                  <div className="text-sm font-bold">
                    {award ? (
                      <span className="text-emerald-700">{award.teamName}</span>
                    ) : (
                      <span className="text-brand-slate">{p.how === "pick" ? "هنوز انتخاب نشده" : "—"}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section aria-labelledby="scores-title">
          <h2 id="scores-title" className="text-lg font-black text-brand-navy mb-3">
            {settledAt ? "امتیاز ثبت‌شدهٔ تیم‌ها" : "پیش‌نمایش امتیاز تیم‌ها"}
          </h2>
          {rows.length === 0 ? (
            <Empty title="هنوز تیمی ثبت نشده" />
          ) : (
            <div className="card overflow-x-auto anim-rise">
              <table className="w-full text-sm min-w-[960px]">
                <caption className="sr-only">امتیاز سه‌معیارهٔ تیم‌ها</caption>
                <thead>
                  <tr className="text-right text-brand-slate border-b border-brand-mist">
                    <th scope="col" className="px-3 py-3 font-bold">رتبه</th>
                    <th scope="col" className="px-3 py-3 font-bold">تیم</th>
                    <th scope="col" className="px-3 py-3 font-bold">اعضا</th>
                    <th scope="col" className="px-3 py-3 font-bold whitespace-nowrap">داوری انسانی (خام → با جبران)</th>
                    <th scope="col" className="px-3 py-3 font-bold whitespace-nowrap">حامیان / سکه</th>
                    <th scope="col" className="px-3 py-3 font-bold whitespace-nowrap">هوش مصنوعی</th>
                    {SCORE_CATEGORY_ORDER.map((k) => (
                      <th key={k} scope="col" className="px-3 py-3 font-bold whitespace-nowrap">
                        {SCORE_CATEGORY_LABELS[k].emoji} {SCORE_CATEGORY_LABELS[k].label}
                        <span className="text-[10px] font-normal"> /{fa(SCORE_WEIGHTS[k])}</span>
                      </th>
                    ))}
                    <th scope="col" className="px-3 py-3 font-bold text-brand-red whitespace-nowrap">کسر تقلب</th>
                    <th scope="col" className="px-3 py-3 font-bold whitespace-nowrap">امتیاز کل</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((t) => (
                    <tr key={t.teamId} className="border-b border-brand-mist last:border-0">
                      <td className="px-3 py-2 fa-num font-black text-brand-navy">{fa(t.rank ?? 0)}</td>
                      <td className="px-3 py-2 font-bold text-brand-navy">{teamNames.get(t.teamId) ?? t.teamId}</td>
                      <td className="px-3 py-2 fa-num">
                        {fa(t.memberCount)}
                        {t.boostPct > 0 && <span className="text-xs text-amber-600"> (+{fa(t.boostPct)}٪)</span>}
                      </td>
                      <td className="px-3 py-2 fa-num whitespace-nowrap">
                        {t.juryRaw === null ? (
                          <span className="text-brand-slate">داوری نشده</span>
                        ) : (
                          <>
                            {fa(round1(t.juryRaw))} → {fa(round1(t.juryAdjusted))}
                          </>
                        )}
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
          )}
        </section>
      </Container>
    </>
  );
}
