import { SCORE_CATEGORY_LABELS } from "@/lib/score-labels";
import { MARKET_SUB_LABEL, type MarketSubWeights, type TrackWeights } from "@/lib/tracks";
import type { TeamResult } from "@/lib/economy/types";
import { fa, coins } from "@/lib/persian";

/** آمار خام بازار یک محصول برای ستون جزئیات */
export type BazaarFigures = {
  activeInstalls: number;
  revenueToman: number;
  rating: number | null;
  commentCount: number;
  flagged: boolean;
};

const MARKET_SUB_ORDER: readonly (keyof MarketSubWeights)[] = ["support", "activeInstalls", "revenue", "rating", "comments"];

/** «۷۷ از ۱۰۰»؛ null یعنی هنوز داوری نشده */
export function juryDetail(t: Pick<TeamResult, "juryRaw">): string | null {
  if (t.juryRaw == null) return null;
  return `${fa(Math.round(t.juryRaw))} از ۱۰۰`;
}

function marketSubDetail(key: keyof MarketSubWeights, result: TeamResult, bazaar?: BazaarFigures | null): React.ReactNode {
  if (key === "support") {
    return (
      <>
        {fa(result.supporters)} حامی · {coins(result.coinsReceived)}
        <span className="block text-xs">نمرهٔ درجه‌دو: {fa(Math.round(result.people))}</span>
      </>
    );
  }
  if (!bazaar) return "آماری ثبت نشده";
  if (bazaar.flagged) return "در حال بررسی؛ تا رفع پرچم حساب نمی‌شود";
  switch (key) {
    case "activeInstalls":
      return `${fa(bazaar.activeInstalls)} نصب`;
    case "revenue":
      return `${fa(bazaar.revenueToman)} تومان`;
    case "rating":
      return bazaar.rating == null ? "بدون امتیاز" : `${fa(bazaar.rating.toFixed(1)).replace(".", "٫")} از ۵`;
    case "comments":
      return `${fa(bazaar.commentCount)} نظر`;
  }
}

/**
 * ریزامتیاز یک ثبت با وزن‌های محور خودش: داوری، بازار با زیرشاخص‌ها، هوش مصنوعی، کسر تقلب و امتیاز کل.
 * زیرشاخصی که در این محور وزن ندارد نمایش داده نمی‌شود. مشترک بین صفحهٔ نتایج و گزارش چاپی هر تیم.
 */
export function ScoreBreakdown({
  result,
  weights,
  bazaar,
  cheatNote,
  caption,
}: {
  result: TeamResult;
  weights: TrackWeights;
  bazaar?: BazaarFigures | null;
  cheatNote?: string;
  caption: string;
}) {
  const total = (weights.jury + weights.market + weights.ai) * 10;
  const jury = juryDetail(result);
  const marketMax = weights.market * 10;
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
          detail={jury == null ? "هنوز داوری نشده" : <>میانگین نمرهٔ داوران {jury}</>}
          pts={result.pts.jury}
          max={weights.jury * 10}
        />
        <Row
          label={`${SCORE_CATEGORY_LABELS.market.emoji} ${SCORE_CATEGORY_LABELS.market.label}`}
          detail="جمع زیرشاخص‌های پایین"
          pts={result.pts.market}
          max={marketMax}
        />
        {MARKET_SUB_ORDER.filter((k) => weights.marketSub[k] > 0).map((k) => (
          <Row
            key={k}
            sub
            label={MARKET_SUB_LABEL[k]}
            detail={marketSubDetail(k, result, bazaar)}
            pts={result.marketDetail[k]}
            max={(marketMax * weights.marketSub[k]) / 100}
          />
        ))}
        <Row
          label={`${SCORE_CATEGORY_LABELS.ai.emoji} ${SCORE_CATEGORY_LABELS.ai.label}`}
          detail={result.ai == null ? "هنوز ارزیابی نشده" : `${fa(Math.round(result.ai))} از ۱۰۰`}
          pts={result.pts.ai}
          max={weights.ai * 10}
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

function Row({ label, detail, pts, max, sub }: { label: string; detail: React.ReactNode; pts: number; max: number; sub?: boolean }) {
  return (
    <tr className="border-b border-brand-mist align-top">
      <th scope="row" className={`px-3 py-2 text-right whitespace-nowrap ${sub ? "pr-8 font-normal text-brand-slate" : "font-bold text-brand-navy"}`}>
        {label}
      </th>
      <td className={`px-3 py-2 text-brand-slate fa-num ${sub ? "text-xs" : ""}`}>{detail}</td>
      <td className={`px-3 py-2 fa-num whitespace-nowrap ${sub ? "text-xs" : "font-bold"}`}>
        {fa(Math.round(pts))} <span className="font-normal text-brand-slate">/ {fa(Math.round(max))}</span>
      </td>
    </tr>
  );
}
