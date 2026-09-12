import { fa } from "@/lib/persian";
import { AiUnavailable } from "@/components/AiUnavailable";

const BARS: { key: "analystClarity" | "analystFeasibility" | "analystNovelty"; label: string; color: string }[] = [
  { key: "analystClarity", label: "وضوح", color: "bg-brand-cyan" },
  { key: "analystFeasibility", label: "قابل‌ساخت بودن", color: "bg-brand-red" },
  { key: "analystNovelty", label: "تازگی", color: "bg-amber-500" },
];

export function AnalystCard({
  clarity,
  feasibility,
  novelty,
  summary,
  aiOff = false,
}: {
  clarity: number | null;
  feasibility: number | null;
  novelty: number | null;
  summary: string | null;
  aiOff?: boolean;
}) {
  const scores = { analystClarity: clarity, analystFeasibility: feasibility, analystNovelty: novelty };
  if (clarity === null && feasibility === null && novelty === null) {
    return aiOff ? <AiUnavailable /> : null;
  }
  return (
    <div className="card p-6 anim-rise">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-2xl">🔬</span>
        <h3 className="font-black text-brand-navy">نظر تحلیل‌گر هوش مصنوعی</h3>
      </div>
      <div className="space-y-3">
        {BARS.map((b) => {
          const v = scores[b.key] ?? 0;
          return (
            <div key={b.key}>
              <div className="flex justify-between text-xs font-bold text-brand-slate mb-1">
                <span>{b.label}</span>
                <span className="fa-num">{fa(v)}٪</span>
              </div>
              <div className="h-2.5 rounded-pill bg-brand-sky overflow-hidden">
                <div className={`h-full rounded-pill ${b.color}`} style={{ width: `${v}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      {summary && <p className="mt-4 text-sm text-brand-navy/90 leading-7 bg-brand-ice rounded-2xl p-4">{summary}</p>}
    </div>
  );
}
