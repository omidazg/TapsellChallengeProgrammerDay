"use client";

import { useState, useTransition } from "react";
import { Alert } from "@/components/ui";
import { updateDisplayNameAction } from "./actions";

/** نام نمایشی اختیاری برای ویترین و بورد خبر */
export function DisplayNameForm({ displayName }: { displayName: string }) {
  const [value, setValue] = useState(displayName);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setOk(false);
        startTransition(async () => {
          const res = await updateDisplayNameAction(value);
          if (res.error) setError(res.error);
          else setOk(true);
        });
      }}
    >
      {error && <Alert kind="error">{error}</Alert>}
      {ok && <Alert kind="ok">ذخیره شد.</Alert>}
      <div>
        <label className="label" htmlFor="display-name-input">نام و نام خانوادگی (اختیاری)</label>
        <input id="display-name-input" className="input" maxLength={60} value={value} onChange={(e) => setValue(e.target.value)} placeholder="مثلاً سارا محمدی" />
      </div>
      <button type="submit" disabled={pending} className="btn-primary w-full sm:w-auto sm:self-start">
        {pending ? "در حال ذخیره…" : "ذخیره"}
      </button>
    </form>
  );
}
