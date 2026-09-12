"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Alert } from "@/components/ui";
import { updateSettingsAction, type AdminActionState } from "./actions";

// هیچ چیزی از `@/lib/admin` وارد نمی‌شود: آن ماژول به prisma وابسته است
// و نباید در باندل کلاینت بیاید. فیلدها از صفحهٔ سرور می‌رسند.
export type SettingField = { key: string; label: string; value: string; kind: "number" | "datetime" };

function SubmitButton() {
  const status = useFormStatus();
  return (
    <button type="submit" disabled={status.pending} className="btn-primary">
      {status.pending ? "در حال ذخیره…" : "ذخیرهٔ تنظیمات"}
    </button>
  );
}

export function SettingsForm({ fields }: { fields: SettingField[] }) {
  const [state, formAction] = useActionState<AdminActionState, FormData>(updateSettingsAction, {});

  return (
    <form action={formAction} className="card p-6 space-y-4 anim-rise">
      <h2 className="text-lg font-black text-brand-navy">تنظیمات بازی</h2>
      {state.error && <Alert kind="error">{state.error}</Alert>}
      {state.ok && <Alert kind="ok">تنظیمات ذخیره شد.</Alert>}
      <div className="grid sm:grid-cols-2 gap-4">
        {fields.map((f) => (
          <div key={f.key}>
            <label className="label" htmlFor={f.key}>{f.label}</label>
            {f.kind === "datetime" ? (
              <input id={f.key} name={f.key} type="datetime-local" defaultValue={f.value} className="input" />
            ) : (
              <input id={f.key} name={f.key} type="number" step="any" required defaultValue={f.value} className="input" />
            )}
          </div>
        ))}
      </div>
      <SubmitButton />
    </form>
  );
}
