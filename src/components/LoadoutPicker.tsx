"use client";

import { useState, useTransition } from "react";
import { Alert } from "@/components/ui";
import { ROLES, POWERS, type RoleKey, type PowerKey } from "@/lib/constants";
import { updateLoadoutAction } from "@/app/team/settings/actions";

/** هم‌تیمی‌هایی که هر نقش/قدرت را دارند؛ برای هماهنگی کنار هر گزینه نشان داده می‌شود */
export type TakenBy = { roles: Partial<Record<RoleKey, string[]>>; powers: Partial<Record<PowerKey, string[]>> };

/**
 * فرم انتخاب نقش و قدرت. targetId خالی یعنی چیدمان خود کاربر؛ در غیر این صورت سرپرست
 * چیدمان یک هم‌تیمی را تنظیم می‌کند (سرور دوباره مجوز را بررسی می‌کند).
 */
export function LoadoutPicker({
  targetId,
  role: initialRole,
  power: initialPower,
  powerLocked = false,
  takenBy,
  compact = false,
  idPrefix = "loadout",
}: {
  targetId?: string;
  role: RoleKey;
  power: PowerKey;
  powerLocked?: boolean;
  takenBy?: TakenBy;
  compact?: boolean;
  idPrefix?: string;
}) {
  const [role, setRole] = useState<RoleKey>(initialRole);
  const [power, setPower] = useState<PowerKey>(initialPower);
  const [saved, setSaved] = useState({ role: initialRole, power: initialPower });
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [pending, startTransition] = useTransition();
  // اگر چیدمان از جای دیگری عوض شد (مثلاً سرپرست)، پس از تازه‌سازی صفحه فرم با مقدار تازه هم‌گام می‌شود
  const [synced, setSynced] = useState({ role: initialRole, power: initialPower });
  if (synced.role !== initialRole || synced.power !== initialPower) {
    setSynced({ role: initialRole, power: initialPower });
    setSaved({ role: initialRole, power: initialPower });
    setRole(initialRole);
    setPower(initialPower);
  }
  const dirty = role !== saved.role || power !== saved.power;

  function save() {
    setError(null);
    setOk(false);
    startTransition(async () => {
      const res = await updateLoadoutAction({ targetId, role, power });
      if (res.error) setError(res.error);
      else {
        setSaved({ role, power });
        setOk(true);
      }
    });
  }

  const cell = compact ? "p-2.5" : "p-3.5";

  return (
    <div className="grid gap-4">
      {error && <Alert kind="error">{error}</Alert>}
      {ok && !dirty && <Alert kind="ok">چیدمان ذخیره شد.</Alert>}

      <fieldset>
        <legend className="label">نقش</legend>
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(ROLES) as RoleKey[]).map((k) => {
            const active = role === k;
            const others = takenBy?.roles[k] ?? [];
            return (
              <button
                key={k}
                type="button"
                id={`${idPrefix}-role-${k}`}
                onClick={() => setRole(k)}
                aria-pressed={active}
                className={`rounded-2xl border-2 ${cell} text-right transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan ${active ? "border-brand-red bg-red-50" : "border-brand-mist bg-white hover:border-brand-cyan"}`}
              >
                <div className="text-xl" aria-hidden>{ROLES[k].emoji}</div>
                <div className="mt-1 text-sm font-black text-brand-navy">{ROLES[k].label}</div>
                {others.length > 0 && <div className="mt-0.5 text-[11px] text-brand-slate break-words">دارد: {others.join("، ")}</div>}
              </button>
            );
          })}
        </div>
        {!compact && <p className="mt-2 text-xs text-brand-slate">{ROLES[role].desc}</p>}
      </fieldset>

      <fieldset disabled={powerLocked}>
        <legend className="label">قدرت ویژه</legend>
        {powerLocked && <p className="mb-2 text-xs text-brand-slate">🔒 این قدرت استفاده شده و قابل تعویض نیست.</p>}
        <div className={`grid gap-2 ${compact ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-3"}`}>
          {(Object.keys(POWERS) as PowerKey[]).map((k) => {
            const active = power === k;
            const others = takenBy?.powers[k] ?? [];
            return (
              <button
                key={k}
                type="button"
                id={`${idPrefix}-power-${k}`}
                onClick={() => setPower(k)}
                aria-pressed={active}
                className={`rounded-2xl border-2 ${cell} text-right transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan disabled:opacity-50 ${active ? "border-brand-cyan-dark bg-brand-ice" : "border-brand-mist bg-white hover:border-brand-cyan"}`}
              >
                <div className="text-xl" aria-hidden>{POWERS[k].emoji}</div>
                <div className="mt-1 text-sm font-black text-brand-navy">{POWERS[k].label}</div>
                {others.length > 0 && <div className="mt-0.5 text-[11px] text-brand-slate break-words">دارد: {others.join("، ")}</div>}
              </button>
            );
          })}
        </div>
        {!compact && <p className="mt-2 text-xs text-brand-slate">{POWERS[power].desc}</p>}
      </fieldset>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={save} disabled={pending || !dirty} className="btn-primary w-full sm:w-auto">
          {pending ? "در حال ذخیره…" : "ذخیرهٔ نقش و قدرت"}
        </button>
        {dirty && !pending && (
          <button
            type="button"
            onClick={() => {
              setRole(saved.role);
              setPower(saved.power);
            }}
            className="btn-ghost w-full sm:w-auto"
          >
            برگرداندن
          </button>
        )}
      </div>
    </div>
  );
}
