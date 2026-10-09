import { SCORE_WEIGHTS } from "@/lib/constants";
import { SCORE_CATEGORY_LABELS } from "@/lib/score-labels";
import type { TeamResult } from "@/lib/economy/types";
import { formatMillion } from "@/lib/prizes";
import { fa, coins } from "@/lib/persian";

/** مبلغ میلیونی (تومان) با رقم فارسی، جداکنندهٔ هزارگان و ممیز فارسی */
export function millionFa(n: number): string {
  return fa(Number(formatMillion(n))).replace(".", "٫");
}

/** عنوان جبران تیم کوچک بر اساس تعداد اعضا */
export function boostLabel(memberCount: number): string {
  return memberCount <= 1 ? "شرکت فردی" : "تیم دونفره";
}

/** «۷۷ → +۱۵٪ → ۸۹»؛ null یعنی هنوز داوری نشده */
export function juryDetail(t: Pick<TeamResult, "juryRaw" | "boostPct" | "juryAdjusted">): string | null {
  if (t.juryRaw == null) return null;
  if (t.boostPct <= 0) return `${fa(Math.round(t.juryRaw))} از ۱۰۰`;
  return `${fa(Math.round(t.juryRaw))} → +${fa(t.boostPct)}٪ → ${fa(Math.round(t.juryAdjusted))}`;
}

/**
 * ریزامتیاز یک تیم در سه معیار + کسر تقلب و امتیاز کل.
 * مشترک بین صفحهٔ نتایج و گزارش چاپی هر تیم تا عددها و متن‌ها یکی بمانند.
 */
export function ScoreBreakdown({ result, cheatNote, caption }: { result: TeamResult; cheatNote?: string; caption: string }) {
  const total = SCORE_WEIGHTS.jury + SCORE_WEIGHTS.people + SCORE_WEIGHTS.ai;
  const jury = juryDetail(result);
  return (
    <table className="w-full text-sm">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr className="text-right text-brand-slate border-b border-brand-mist">
          <th scope="col" className="px-3 py-2 font-bold">معیار</th>
          <th scope="col" className="px-3 py-2 font-bold">جزئیات</th>
          <th scope="col" className="px-3 py-2 font-bold">امتیاز</th>
        </tr>
      </thead>
      <tbody>
        <Row
          label={`${SCORE_CATEGORY_LABELS.jury.emoji} ${SCORE_CATEGORY_LABELS.jury.label}`}
          detail={
            jury == null ? (
              "هنوز داوری نشده"
            ) : (
              <>
                نمرهٔ داوران {jury}
                {result.boostPct > 0 && <span className="block text-xs">جبران {boostLabel(result.memberCount)}</span>}
              </>
            )
          }
          pts={result.pts.jury}
          max={SCORE_WEIGHTS.jury}
        />
        <Row
          label={`${SCORE_CATEGORY_LABELS.people.emoji} ${SCORE_CATEGORY_LABELS.people.label}`}
          detail={
            <>
              {fa(result.supporters)} حامی · {coins(result.coinsReceived)}
              <span className="block text-xs">نمرهٔ درجه‌دو: {fa(Math.round(result.people))}</span>
            </>
          }
          pts={result.pts.people}
          max={SCORE_WEIGHTS.people}
        />
        <Row
          label={`${SCORE_CATEGORY_LABELS.ai.emoji} ${SCORE_CATEGORY_LABELS.ai.label}`}
          detail={result.ai == null ? "هنوز ارزیابی نشده" : `${fa(Math.round(result.ai))} از ۱۰۰`}
          pts={result.pts.ai}
          max={SCORE_WEIGHTS.ai}
        />
        {result.cheatPenalty > 0 && (
          <tr className="border-b border-brand-mist bg-red-50">
            <th scope="row" className="px-3 py-2 text-right font-bold text-brand-red">⚠️ کسر تقلب</th>
            <td className="px-3 py-2 text-brand-red">{cheatNote || "با تصمیم برگزارکننده"}</td>
            <td className="px-3 py-2 font-black text-brand-red fa-num whitespace-nowrap">−{fa(result.cheatPenalty)}</td>
          </tr>
        )}
        <tr className="bg-brand-ice">
          <th scope="row" className="px-3 py-2 text-right font-black text-brand-navy">امتیاز کل</th>
          <td className="px-3 py-2" />
          <td className="px-3 py-2 font-black text-brand-navy fa-num whitespace-nowrap">
            {fa(Math.round(result.total))} <span className="font-normal text-brand-slate">/ {fa(total)}</span>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

function Row({ label, detail, pts, max }: { label: string; detail: React.ReactNode; pts: number; max: number }) {
  return (
    <tr className="border-b border-brand-mist align-top">
      <th scope="row" className="px-3 py-2 text-right font-bold text-brand-navy whitespace-nowrap">{label}</th>
      <td className="px-3 py-2 text-brand-slate fa-num">{detail}</td>
      <td className="px-3 py-2 font-bold fa-num whitespace-nowrap">
        {fa(Math.round(pts))} <span className="font-normal text-brand-slate">/ {fa(max)}</span>
      </td>
    </tr>
  );
}
