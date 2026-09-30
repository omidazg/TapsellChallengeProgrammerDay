"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Alert } from "@/components/ui";
import { fa } from "@/lib/persian";
import { loginAction, requestLoginOtpAction, verifyLoginOtpAction, type LoginResult } from "./actions";

type Mode = "email" | "phone";
type Access = LoginResult["access"];

export function LoginForm({ next, smsEnabled }: { next?: string | null; smsEnabled: boolean }) {
  const [mode, setMode] = useState<Mode>("email");

  return (
    <div className="card p-6 md:p-8 anim-rise">
      {smsEnabled && (
        <div role="tablist" aria-label="روش ورود" className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
          <TabButton active={mode === "email"} onClick={() => setMode("email")}>
            ایمیل و رمز
          </TabButton>
          <TabButton active={mode === "phone"} onClick={() => setMode("phone")}>
            موبایل و کد پیامکی
          </TabButton>
        </div>
      )}
      {mode === "email" ? <EmailLogin next={next} /> : <PhoneLogin next={next} />}
      <p className="mt-6 text-center text-sm text-brand-slate">
        هنوز حساب نساخته‌ای؟{" "}
        <Link href={next ? `/register?next=${encodeURIComponent(next)}` : "/register"} className="font-bold text-brand-cyan-dark">
          ثبت‌نام کن
        </Link>
      </p>
      <p className="mt-2 text-center text-sm text-brand-slate">
        در لیست سفید نیستی؟{" "}
        <Link href="/access-request" className="font-bold text-brand-cyan-dark">
          درخواست دسترسی بده
        </Link>
      </p>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`rounded-lg px-3 py-2 text-sm font-bold transition ${active ? "bg-white text-brand-navy shadow" : "text-brand-slate"}`}
    >
      {children}
    </button>
  );
}

/** راهنمای قدم بعدی برای کسی که حساب ندارد */
function AccessHint({ access, next, email, phone }: { access: Access; next?: string | null; email?: string; phone?: string }) {
  if (access === "NONE" || access === "REJECTED") {
    const q = new URLSearchParams();
    if (email) q.set("email", email);
    if (phone) q.set("phone", phone);
    return (
      <Link href={`/access-request${q.size ? `?${q}` : ""}`} className="btn-cyan mt-3 w-full">
        درخواست دسترسی
      </Link>
    );
  }
  if (access === "NO_ACCOUNT") {
    return (
      <Link href={next ? `/register?next=${encodeURIComponent(next)}` : "/register"} className="btn-cyan mt-3 w-full">
        ثبت‌نام
      </Link>
    );
  }
  return null;
}

function EmailLogin({ next }: { next?: string | null }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [access, setAccess] = useState<Access>(undefined);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setAccess(undefined);
    startTransition(async () => {
      const res = await loginAction({ email, password, next });
      if (res?.error) {
        setError(res.error);
        setAccess(res.access);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      {error && (
        <div id="login-error">
          <Alert kind="error">{error}</Alert>
          <AccessHint access={access} next={next} email={email.trim()} />
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
    </form>
  );
}

function PhoneLogin({ next }: { next?: string | null }) {
  const [phone, setPhone] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [access, setAccess] = useState<Access>(undefined);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  function send() {
    setError(null);
    setAccess(undefined);
    startTransition(async () => {
      const res = await requestLoginOtpAction(phone);
      if (res.ok) {
        setSentTo(res.phone);
        setDevCode(res.devCode ?? null);
        setCooldown(res.resendSec);
        setCode("");
      } else {
        setError(res.error);
        setAccess(res.access);
        if (res.retryAfterSec) setCooldown(res.retryAfterSec);
      }
    });
  }

  function verify(e: React.FormEvent) {
    e.preventDefault();
    if (!sentTo) return send();
    setError(null);
    startTransition(async () => {
      const res = await verifyLoginOtpAction({ phone: sentTo, code, next });
      if (res?.error) setError(res.error);
    });
  }

  return (
    <form onSubmit={verify} className="grid gap-4">
      {error && (
        <div id="otp-error">
          <Alert kind="error">{error}</Alert>
          <AccessHint access={access} next={next} phone={phone.trim()} />
        </div>
      )}
      <div>
        <label className="label" htmlFor="phone">شمارهٔ موبایل</label>
        <input
          id="phone"
          type="tel"
          dir="ltr"
          inputMode="tel"
          autoComplete="tel"
          className="input"
          value={phone}
          onChange={(e) => {
            setPhone(e.target.value);
            setSentTo(null);
            setDevCode(null);
          }}
          placeholder="09xxxxxxxxx"
          required
          aria-describedby={error ? "otp-error" : undefined}
        />
      </div>

      {sentTo ? (
        <>
          <div>
            <label className="label" htmlFor="otp">کد تأیید</label>
            <input
              id="otp"
              dir="ltr"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              className="input tracking-[0.4em] text-center"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="••••••"
              required
              autoFocus
            />
            <p className="mt-1.5 text-xs text-brand-slate">کد شش‌رقمی به شماره‌ات پیامک شد و دو دقیقه اعتبار دارد.</p>
            {devCode && (
              <p className="mt-1.5 text-xs font-bold text-brand-cyan-dark">
                محیط آزمایشی — کد: <span className="fa-num" dir="ltr">{devCode}</span>
              </p>
            )}
          </div>
          <button type="submit" disabled={pending || code.trim().length < 6} className="btn-primary w-full">
            {pending ? "در حال بررسی…" : "ورود با کد"}
          </button>
          <button type="button" onClick={send} disabled={pending || cooldown > 0} className="btn-ghost w-full !text-sm">
            {cooldown > 0 ? `ارسال دوباره تا ${fa(cooldown)} ثانیه` : "ارسال دوبارهٔ کد"}
          </button>
        </>
      ) : (
        <button type="submit" disabled={pending || cooldown > 0} className="btn-primary w-full">
          {pending ? "در حال ارسال…" : cooldown > 0 ? `${fa(cooldown)} ثانیه صبر کن` : "دریافت کد پیامکی"}
        </button>
      )}
    </form>
  );
}
