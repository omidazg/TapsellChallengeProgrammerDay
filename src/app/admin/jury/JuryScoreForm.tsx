"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Alert } from "@/components/ui";
import { saveJuryScoreAction, type JuryActionState } from "./actions";

function SubmitButton() {
  const status = useFormStatus();
  return (
    <button type="submit" disabled={status.pending} className="btn-primary !py-2 !px-4 min-h-10">
      {status.pending ? "…" : "ذخیرهٔ نمره"}
    </button>
  );
}

/** سه پرسش داوری انسانی؛ هر کدام ۰..۱۰ (خالی = هنوز نمره نداده) */
const QUESTIONS = [
  { name: "juryWorks", label: "آیا واقعاً کار می‌کند؟" },
  { name: "juryValue", label: "ارزش واقعی برای کاربر یا گروه پگاه" },
  { name: "juryPitch", label: "تیزر و ارائه" },
] as const;

export type JuryValues = { juryWorks: number | null; juryValue: number | null; juryPitch: number | null };

export function JuryScoreForm({ productId, values }: { productId: string; values: JuryValues }) {
  const [state, formAction] = useActionState<JuryActionState, FormData>(saveJuryScoreAction, {});
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="productId" value={productId} />
      <div className="grid gap-3 sm:grid-cols-3">
        {QUESTIONS.map((q) => (
          <div key={q.name}>
            <label className="label" htmlFor={`${q.name}-${productId}`}>
              {q.label} <span className="text-brand-slate font-normal">(۰ تا ۱۰)</span>
            </label>
            <input
              id={`${q.name}-${productId}`}
              name={q.name}
              type="number"
              inputMode="numeric"
              min={0}
              max={10}
              step={1}
              defaultValue={values[q.name] ?? ""}
              placeholder="—"
              className="input !py-2 !px-3 w-full fa-num"
            />
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton />
        {state.ok && <span className="text-emerald-600 text-xs font-bold" role="status">ذخیره شد</span>}
        <span className="text-[11px] text-brand-slate">فیلد خالی یعنی هنوز به آن پرسش نمره نداده‌ای.</span>
      </div>
      {state.error && <Alert kind="error">{state.error}</Alert>}
    </form>
  );
}
