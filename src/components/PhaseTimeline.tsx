import { PHASES, PHASE_LABEL, type Phase } from "@/lib/phases";
import { fa, jdatetime } from "@/lib/persian";

/**
 * نمایش پلکانی هفت فاز بازی با فاز جاری هایلایت‌شده.
 * فقط از `@/lib/phases` (بدون وابستگی به prisma) استفاده می‌کند، پس هم در سرور
 * و هم — در صورت نیاز — در کلاینت قابل استفاده است. کامپوننت سرور است (بدون state).
 */
export function PhaseTimeline({ phase, endsAt }: { phase: Phase; endsAt: string | null }) {
  const currentIndex = PHASES.indexOf(phase);

  return (
    <div className="card p-5 sm:p-6">
      <h3 className="text-sm font-bold text-brand-cyan-dark mb-4">مسیر بازی</h3>
      <ol className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {PHASES.map((p, i) => {
          const isCurrent = i === currentIndex;
          const isDone = i < currentIndex;
          return (
            <li
              key={p}
              className={
                "rounded-xl p-3 text-center transition " +
                (isCurrent
                  ? "bg-brand-navy text-white shadow-lift"
                  : isDone
                    ? "bg-brand-ice text-brand-navy"
                    : "bg-white border border-dashed border-brand-slate/30 text-brand-slate")
              }
            >
              <div className="text-[10px] font-bold opacity-70">مرحلهٔ {fa(i + 1)}</div>
              <div className="mt-1 text-xs sm:text-sm font-black">{PHASE_LABEL[p]}</div>
              {isCurrent && endsAt && (
                <div className="mt-1 text-[10px] opacity-80 fa-num">{jdatetime(new Date(endsAt))}</div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
