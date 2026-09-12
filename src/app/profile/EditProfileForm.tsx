"use client";

import { useState, useTransition } from "react";
import { Alert } from "@/components/ui";
import { updateProfileAction } from "./actions";

type Stats = { coffee: number; bugs: number; sleep: number; confidence: number };

export function EditProfileForm({ nickname, stats }: { nickname: string; stats: Stats }) {
  const [form, setForm] = useState({ nickname, ...stats });
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOk(false);
    startTransition(async () => {
      const res = await updateProfileAction(form);
      if (res.error) setError(res.error);
      else setOk(true);
    });
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      {error && <Alert kind="error">{error}</Alert>}
      {ok && <Alert kind="ok">تغییرات ذخیره شد.</Alert>}
      <div>
        <label className="label" htmlFor="edit-nickname">نام مستعار</label>
        <input
          id="edit-nickname"
          className="input"
          value={form.nickname}
          onChange={(e) => setForm((f) => ({ ...f, nickname: e.target.value }))}
        />
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <NumberField label="قهوه" min={0} max={10} value={form.coffee} onChange={(v) => setForm((f) => ({ ...f, coffee: v }))} />
        <NumberField label="باگ" min={0} max={100} value={form.bugs} onChange={(v) => setForm((f) => ({ ...f, bugs: v }))} />
        <NumberField label="خواب" min={0} max={12} value={form.sleep} onChange={(v) => setForm((f) => ({ ...f, sleep: v }))} />
        <NumberField label="اعتمادبه‌نفس" min={0} max={150} value={form.confidence} onChange={(v) => setForm((f) => ({ ...f, confidence: v }))} />
      </div>
      <button type="submit" disabled={pending} className="btn-primary w-full sm:w-auto sm:self-start">
        {pending ? "در حال ذخیره…" : "ذخیرهٔ تغییرات"}
      </button>
    </form>
  );
}

function NumberField({
  label,
  min,
  max,
  value,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <input
        type="number"
        min={min}
        max={max}
        className="input fa-num"
        value={value}
        onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value) || 0)))}
      />
    </div>
  );
}
