import Link from "next/link";
import { fa } from "@/lib/persian";

type Step = { key: string; label: string; href: string; done: boolean };

/**
 * ترتیب کارهای هر تیم در یک محور: تیم، ایده، محصول و (در محور ساخت محصول) درخواست انتشار.
 * هر تیم با سرعت خودش جلو می‌رود؛ قدم جاری اولین قدم انجام‌نشده است.
 */
export function TrackProgress({
  trackId,
  hasTeam,
  ideaSubmitted,
  productSubmitted,
  publish,
}: {
  trackId: string;
  hasTeam: boolean;
  ideaSubmitted: boolean;
  productSubmitted: boolean;
  /** وضعیت انتشار؛ null یعنی این محور قدم انتشار ندارد */
  publish: { requested: boolean } | null;
}) {
  const q = `?track=${encodeURIComponent(trackId)}`;
  const steps: Step[] = [
    { key: "team", label: "تیم", href: "/team", done: hasTeam },
    { key: "idea", label: "ثبت ایده", href: `/idea${q}`, done: ideaSubmitted },
    { key: "build", label: "ثبت محصول", href: `/build${q}`, done: productSubmitted },
    ...(publish ? [{ key: "publish", label: "درخواست انتشار", href: `/build${q}#studio-title`, done: publish.requested }] : []),
  ];
  const currentIdx = steps.findIndex((s) => !s.done);
  return (
    <ol aria-label="ترتیب کارهای تیم در این محور" className="card p-3 flex flex-wrap items-center gap-x-2 gap-y-2 text-xs anim-rise">
      {steps.map((s, i) => {
        const current = i === currentIdx;
        return (
          <li key={s.key} className="flex items-center gap-2">
            {i > 0 && <span aria-hidden className="text-brand-slate">←</span>}
            <Link
              href={s.href}
              aria-current={current ? "step" : undefined}
              className={`inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 font-bold transition ${s.done ? "text-ok" : current ? "bg-brand-navy text-white" : "text-brand-slate hover:bg-brand-ice"}`}
            >
              <span aria-hidden className="fa-num">{s.done ? "✓" : fa(i + 1)}</span>
              {s.label}
              {s.done && <span className="sr-only">(انجام شده)</span>}
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
