"use client";

import { useState, useTransition } from "react";
import { Alert } from "@/components/ui";
import { ROLES, type RoleKey } from "@/lib/constants";
import { updateSkillAction } from "./actions";

/** انتخاب مهارت اصلی — فقط برچسب معرفی و هم‌تیم‌یابی؛ اثری در امتیاز ندارد */
export function SkillPicker({ role: initialRole }: { role: RoleKey | null }) {
  const [role, setRole] = useState<RoleKey | null>(initialRole);
  const [saved, setSaved] = useState<RoleKey | null>(initialRole);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [pending, startTransition] = useTransition();
  const dirty = role !== saved;

  function save() {
    if (!role) return;
    setError(null);
    setOk(false);
    startTransition(async () => {
      const res = await updateSkillAction(role);
      if (res.error) setError(res.error);
      else {
        setSaved(role);
        setOk(true);
      }
    });
  }

  return (
    <div className="grid gap-4">
      {error && <Alert kind="error">{error}</Alert>}
      {ok && !dirty && <Alert kind="ok">مهارتت ذخیره شد.</Alert>}

      <fieldset>
        <legend className="label">مهارت اصلی</legend>
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(ROLES) as RoleKey[]).map((k) => {
            const active = role === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setRole(k)}
                aria-pressed={active}
                className={`rounded-2xl border-2 p-3 text-right transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan ${active ? "border-brand-red bg-red-50" : "border-brand-mist bg-white hover:border-brand-cyan"}`}
              >
                <div className="text-xl" aria-hidden>{ROLES[k].emoji}</div>
                <div className="mt-1 text-sm font-black text-brand-navy">{ROLES[k].label}</div>
              </button>
            );
          })}
        </div>
        {role && <p className="mt-2 text-xs text-brand-slate">{ROLES[role].desc}</p>}
      </fieldset>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={save} disabled={pending || !dirty || !role} className="btn-primary w-full sm:w-auto">
          {pending ? "در حال ذخیره…" : "ذخیرهٔ مهارت"}
        </button>
        {dirty && !pending && (
          <button type="button" onClick={() => setRole(saved)} className="btn-ghost w-full sm:w-auto">
            برگرداندن
          </button>
        )}
      </div>
    </div>
  );
}
