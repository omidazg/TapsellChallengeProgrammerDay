"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Alert } from "@/components/ui";
import { saveAwardPickAction, type JuryActionState } from "./actions";

export type PickOption = { teamId: string; label: string };
export type PickGroup = { label: string; options: PickOption[] };

function SubmitButton() {
  const status = useFormStatus();
  return (
    <button type="submit" disabled={status.pending} className="btn-primary !py-2 !px-4 min-h-10 shrink-0">
      {status.pending ? "…" : "ذخیره"}
    </button>
  );
}

/** انتخاب تیم برندهٔ یک جایزهٔ انتخابی داوران (ai یا live) */
export function AwardPickForm({
  award,
  title,
  hint,
  current,
  groups,
}: {
  award: "ai" | "live";
  title: string;
  hint: string;
  current: string | null;
  groups: PickGroup[];
}) {
  const [state, formAction] = useActionState<JuryActionState, FormData>(saveAwardPickAction, {});
  const selectId = `award-${award}`;
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="award" value={award} />
      <label className="label" htmlFor={selectId}>{title}</label>
      <p className="text-xs text-brand-slate">{hint}</p>
      <div className="flex flex-wrap items-center gap-2">
        <select key={current ?? ""} id={selectId} name="teamId" defaultValue={current ?? ""} className="input flex-1 min-w-0">
          <option value="">— هنوز انتخاب نشده —</option>
          {groups
            .filter((g) => g.options.length > 0)
            .map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.options.map((o) => (
                  <option key={o.teamId} value={o.teamId}>
                    {o.label}
                  </option>
                ))}
              </optgroup>
            ))}
        </select>
        <SubmitButton />
      </div>
      {state.error && <Alert kind="error">{state.error}</Alert>}
      {state.ok && <span className="text-emerald-600 text-xs font-bold" role="status">ذخیره شد</span>}
    </form>
  );
}
