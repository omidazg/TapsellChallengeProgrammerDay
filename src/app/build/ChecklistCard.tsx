import Link from "next/link";
import { fa } from "@/lib/persian";
import type { ChecklistItem } from "@/lib/product";
import { checklistProgress } from "@/lib/product";
import { Alert } from "@/components/ui";
import { UnsubmitButton } from "./UnsubmitButton";
import { ChecklistLink } from "./ChecklistLink";

function ProgressRing({ value }: { value: number }) {
  const size = 92;
  const stroke = 9;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - value);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--line)" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="var(--color-brand-red)"
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset .4s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-lg font-black text-brand-navy fa-num">
        {fa(Math.round(value * 100))}٪
      </div>
    </div>
  );
}

export function ChecklistCard({
  checklist,
  submitted,
  slug,
  editable,
  aiQuality,
  aiNotes,
}: {
  checklist: ChecklistItem[];
  submitted: boolean;
  slug: string;
  editable: boolean;
  aiQuality: number | null;
  aiNotes: string | null;
}) {
  const progress = checklistProgress(checklist);
  return (
    <div className="card p-5 space-y-4 anim-rise lg:sticky lg:top-20">
      <div className="flex items-center gap-4">
        <ProgressRing value={progress} />
        <div>
          <div className="text-sm font-black text-brand-navy">پیشرفت صفحهٔ محصول</div>
          <div className="text-xs text-brand-slate mt-1">{fa(checklist.filter((i) => i.done).length)} از {fa(checklist.length)} مورد</div>
        </div>
      </div>

      <ul className="space-y-2 stagger">
        {checklist.map((item) => (
          <li key={item.key}>
            {/* کلیک روی هر مورد به فیلد مربوط در فرم اسکرول و فوکوس می‌کند */}
            <ChecklistLink
              fieldId={item.fieldId}
              className="-mx-2 flex items-center gap-2 rounded-xl px-2 py-1 text-sm transition hover:bg-brand-ice focus-visible:bg-brand-ice"
            >
              <span className={item.done ? "text-ok" : "text-brand-slate"} aria-hidden>{item.done ? "✅" : "⬜"}</span>
              <span className={item.done ? "text-brand-navy font-medium" : "text-brand-slate underline decoration-dotted underline-offset-4"}>{item.label}</span>
              <span className="sr-only">{item.done ? "(انجام شده)" : "(انجام نشده)"}</span>
            </ChecklistLink>
          </li>
        ))}
      </ul>

      {submitted && (
        <Alert kind="ok">محصول ثبت نهایی شده است.{editable ? " تا پایان فاز ساخت می‌توانی برای ویرایش دوباره آن را باز کنی." : ""}</Alert>
      )}

      {(aiQuality !== null || aiNotes) && (
        <div className="rounded-2xl bg-brand-ice p-4 space-y-1">
          <div className="text-xs font-bold text-brand-cyan-dark">پیش‌نمرهٔ هوش مصنوعی</div>
          {aiQuality !== null && <div className="text-2xl font-black text-brand-navy fa-num">{fa(aiQuality)} / ۱۰۰</div>}
          {aiNotes && <p className="text-xs text-brand-slate leading-6 whitespace-pre-line break-words">{aiNotes}</p>}
        </div>
      )}

      {submitted && editable && <UnsubmitButton />}

      <Link href={`/market/${slug}`} target="_blank" className="btn-ghost w-full justify-center">
        پیش‌نمایش صفحهٔ محصول ↗
      </Link>
    </div>
  );
}
