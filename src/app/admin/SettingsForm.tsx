"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Alert } from "@/components/ui";
import { SETTING_KEYS, SETTING_LABELS, type SettingKey } from "@/lib/admin";
import { updateSettingsAction, type AdminActionState } from "./actions";

function SubmitButton() {
  const status = useFormStatus();
  return (
    <button type="submit" disabled={status.pending} className="btn-primary">
      {status.pending ? "در حال ذخیره…" : "ذخیرهٔ تنظیمات"}
    </button>
  );
}

export function SettingsForm({ settings }: { settings: Record<SettingKey, string> }) {
  const [state, formAction] = useActionState<AdminActionState, FormData>(updateSettingsAction, {});

  return (
    <form action={formAction} className="card p-6 space-y-4 anim-rise">
      <h2 className="text-lg font-black text-brand-navy">تنظیمات بازی</h2>
      {state.error && <Alert kind="error">{state.error}</Alert>}
      {state.ok && <Alert kind="ok">تنظیمات ذخیره شد.</Alert>}
      <div className="grid sm:grid-cols-2 gap-4">
        {SETTING_KEYS.map((key) => (
          <div key={key}>
            <label className="label" htmlFor={key}>{SETTING_LABELS[key]}</label>
            {key === "market_starts_at" ? (
              <input id={key} name={key} type="datetime-local" defaultValue={settings[key]} className="input" />
            ) : (
              <input id={key} name={key} type="number" step="any" defaultValue={settings[key]} className="input" />
            )}
          </div>
        ))}
      </div>
      <SubmitButton />
    </form>
  );
}
