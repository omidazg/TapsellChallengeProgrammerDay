"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Alert } from "@/components/ui";
import { PHASES, PHASE_LABEL, type Phase } from "@/lib/phase";
import { setPhaseAction, type AdminActionState } from "./actions";

function SubmitButton() {
  const status = useFormStatus();
  return (
    <button type="submit" disabled={status.pending} className="btn-primary">
      {status.pending ? "در حال اعمال…" : "اعمال"}
    </button>
  );
}

export function PhaseForm({ phase, endsAt }: { phase: Phase; endsAt: string | null }) {
  const [state, formAction] = useActionState<AdminActionState, FormData>(setPhaseAction, {});
  const localEndsAt = endsAt ? toLocalInputValue(new Date(endsAt)) : "";

  return (
    <form action={formAction} className="card p-6 space-y-4 anim-rise">
      <h2 className="text-lg font-black text-brand-navy">کنترل فاز بازی</h2>
      {state.error && <Alert kind="error">{state.error}</Alert>}
      {state.ok && <Alert kind="ok">فاز به‌روزرسانی شد.</Alert>}
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="label" htmlFor="phase">فاز</label>
          <select id="phase" name="phase" defaultValue={phase} className="input">
            {PHASES.map((p) => (
              <option key={p} value={p}>
                {PHASE_LABEL[p]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="endsAt">زمان پایان</label>
          <input id="endsAt" name="endsAt" type="datetime-local" defaultValue={localEndsAt} className="input" />
        </div>
      </div>
      <SubmitButton />
    </form>
  );
}

function toLocalInputValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
