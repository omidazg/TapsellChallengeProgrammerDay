"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Alert } from "@/components/ui";
import { loginAction } from "./actions";

export function LoginForm({ next }: { next?: string | null }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await loginAction({ email, password, next });
      if (res?.error) setError(res.error);
    });
  }

  return (
    <form onSubmit={onSubmit} className="card p-6 md:p-8 anim-rise">
      <div className="grid gap-4">
        {error && (
          <div id="login-error">
            <Alert kind="error">{error}</Alert>
          </div>
        )}
        <div>
          <label className="label" htmlFor="email">ایمیل</label>
          <input
            id="email"
            type="email"
            dir="ltr"
            autoComplete="email"
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ایمیل سازمانی‌ات"
            required
            aria-invalid={!!error}
            aria-describedby={error ? "login-error" : undefined}
          />
        </div>
        <div>
          <label className="label" htmlFor="password">رمز عبور</label>
          <input
            id="password"
            type="password"
            dir="ltr"
            autoComplete="current-password"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            aria-invalid={!!error}
            aria-describedby={error ? "login-error" : undefined}
          />
        </div>
        <button type="submit" disabled={pending} className="btn-primary mt-2 w-full">
          {pending ? "در حال ورود…" : "ورود"}
        </button>
      </div>
      <p className="mt-6 text-center text-sm text-brand-slate">
        هنوز حساب نساخته‌ای؟{" "}
        <Link href={next ? `/register?next=${encodeURIComponent(next)}` : "/register"} className="font-bold text-brand-cyan-dark">
          ثبت‌نام کن
        </Link>
      </p>
    </form>
  );
}
