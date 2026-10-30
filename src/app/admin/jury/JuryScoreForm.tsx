"use client";

import { startTransition, useActionState } from "react";
import { Alert } from "@/components/ui";
import { saveJuryScoreAction, type JuryActionState } from "./actions";

/** معیارهای محور؛ هر کدام ۰..۱۰ (خالی = هنوز نمره نداده) و یک یادداشت */
export function JuryScoreForm({
  productId,
  criteria,
  mine,
  note,
  disabled,
}: {
  productId: string;
  criteria: { key: string; label: string }[];
  mine: Record<string, number>;
  note: string;
  disabled: boolean;
}) {
  const [state, formAction, pending] = useActionState<JuryActionState, FormData>(saveJuryScoreAction, {});
  return (
    <form
      // ارسال دستی: ری‌ست خودکار فرم (React 19) نمره‌ها را پس از خطای اعتبارسنجی پاک می‌کرد.
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => formAction(data));
      }}
      className="space-y-3"
    >
      <input type="hidden" name="productId" value={productId} />
      <fieldset disabled={disabled} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          {criteria.map((c) => (
            <div key={c.key}>
              <label className="label" htmlFor={`score-${c.key}-${productId}`}>
                {c.label} <span className="text-brand-slate font-normal">(۰ تا ۱۰)</span>
              </label>
              <input
                id={`score-${c.key}-${productId}`}
                name={`score:${c.key}`}
                type="number"
                inputMode="numeric"
                min={0}
                max={10}
                step={1}
                defaultValue={mine[c.key] ?? ""}
                placeholder="—"
                className="input !py-2 !px-3 w-full fa-num"
              />
            </div>
          ))}
        </div>
        <div>
          <label className="label" htmlFor={`note-${productId}`}>یادداشت</label>
          <textarea id={`note-${productId}`} name="note" rows={2} maxLength={600} defaultValue={note} className="input w-full" />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={pending} className="btn-primary !py-2 !px-4 min-h-10 disabled:opacity-50">
            {pending ? "…" : "ذخیرهٔ نمره"}
          </button>
          {state.ok && !pending && <span className="text-emerald-600 text-xs font-bold" role="status">ذخیره شد</span>}
          <span className="text-xs text-brand-slate">فیلد خالی یعنی هنوز به آن معیار نمره نداده‌ای.</span>
        </div>
      </fieldset>
      {state.error && <Alert kind="error">{state.error}</Alert>}
    </form>
  );
}
