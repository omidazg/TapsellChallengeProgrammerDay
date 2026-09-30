"use client";

import { useState, useTransition } from "react";
import { Alert } from "@/components/ui";
import { Avatar } from "@/components/Avatar";
import { updateTeamSettingsAction } from "./actions";

/** نام و نشان تیم — فقط برای سرپرست */
export function TeamProfileForm({ name: initialName, logoSeed }: { name: string; logoSeed: string }) {
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(shuffleLogo: boolean) {
    setError(null);
    setOk(null);
    startTransition(async () => {
      const res = await updateTeamSettingsAction({ name, shuffleLogo });
      if (res.error) setError(res.error);
      else setOk(shuffleLogo ? "نشان تازهٔ تیم ذخیره شد." : "تنظیمات تیم ذخیره شد.");
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit(false);
      }}
      className="grid gap-4"
    >
      {error && <Alert kind="error">{error}</Alert>}
      {ok && <Alert kind="ok">{ok}</Alert>}
      <div className="flex flex-wrap items-center gap-4">
        <Avatar seed={logoSeed} size={64} />
        <button type="button" onClick={() => submit(true)} disabled={pending} className="btn-ghost">
          🎲 نشان تازه
        </button>
      </div>
      <div>
        <label className="label" htmlFor="team-name">نام تیم</label>
        <input
          id="team-name"
          className="input"
          value={name}
          maxLength={40}
          onChange={(e) => setName(e.target.value)}
        />
        <p className="mt-1 text-xs text-brand-slate">لینک دعوت تیم با تغییر نام عوض نمی‌شود.</p>
      </div>
      <button type="submit" disabled={pending || name.trim() === initialName} className="btn-primary w-full sm:w-auto sm:self-start">
        {pending ? "در حال ذخیره…" : "ذخیرهٔ نام تیم"}
      </button>
    </form>
  );
}
