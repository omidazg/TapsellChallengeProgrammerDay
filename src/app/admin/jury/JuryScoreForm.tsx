"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Alert } from "@/components/ui";
import { saveJuryScoreAction, type JuryActionState } from "./actions";

function SubmitButton() {
  const status = useFormStatus();
  return (
    <button type="submit" disabled={status.pending} className="btn-primary !py-1.5 !px-3">
      {status.pending ? "…" : "ذخیره"}
    </button>
  );
}

export function JuryScoreForm({ productId, juryQuality, juryTeaser }: { productId: string; juryQuality: number | null; juryTeaser: number | null }) {
  const [state, formAction] = useActionState<JuryActionState, FormData>(saveJuryScoreAction, {});
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="productId" value={productId} />
      <div>
        <label className="label" htmlFor={`q-${productId}`}>کیفیت (۰..۱۰۰)</label>
        <input id={`q-${productId}`} name="juryQuality" type="number" min={0} max={100} defaultValue={juryQuality ?? ""} required className="input !py-1.5 !px-3 w-24" />
      </div>
      <div>
        <label className="label" htmlFor={`t-${productId}`}>تیزر (۰..۱۰۰)</label>
        <input id={`t-${productId}`} name="juryTeaser" type="number" min={0} max={100} defaultValue={juryTeaser ?? ""} required className="input !py-1.5 !px-3 w-24" />
      </div>
      <SubmitButton />
      {state.error && <Alert kind="error">{state.error}</Alert>}
      {state.ok && <span className="text-emerald-600 text-xs font-bold">ذخیره شد</span>}
    </form>
  );
}
