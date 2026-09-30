"use client";

import { useActionState, useEffect, useRef } from "react";
import Link from "next/link";
import { Alert } from "@/components/ui";
import { DEPARTMENTS } from "@/app/register/departments";
import { submitAccessRequestAction, type AccessRequestState } from "./actions";
import { AccessStatusBox } from "./AccessStatusBox";

export function AccessRequestForm({ email, phone }: { email: string; phone: string }) {
  const [state, formAction, pending] = useActionState<AccessRequestState, FormData>(submitAccessRequestAction, {});

  return (
    <div className="space-y-4">
      <RequestCard state={state} formAction={formAction} pending={pending} email={email} phone={phone} />
      {/* پس از ثبت درخواست دوباره ساخته می‌شود تا ایمیل ارسال‌شده از پیش در آن باشد */}
      <AccessStatusBox key={state.email ?? ""} defaultEmail={state.email ?? email} />
    </div>
  );
}

function RequestCard({
  state,
  formAction,
  pending,
  email,
  phone,
}: {
  state: AccessRequestState;
  formAction: (fd: FormData) => void;
  pending: boolean;
  email: string;
  phone: string;
}) {
  // فرم پس از موفقیت جایش را به پیام می‌دهد؛ فوکوس را به پیام ببر تا گم نشود
  const doneRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.ok) doneRef.current?.focus();
  }, [state.ok]);

  if (state.ok === "HAS_ACCOUNT") {
    return (
      <div ref={doneRef} tabIndex={-1} className="card p-6 md:p-8 anim-rise space-y-4 focus:outline-none">
        <Alert kind="info">با این ایمیل یا شماره از قبل حساب ساخته شده؛ کافی است وارد شوی.</Alert>
        <Link href="/login" className="btn-primary w-full">ورود</Link>
      </div>
    );
  }
  if (state.ok === "ALLOWED") {
    return (
      <div ref={doneRef} tabIndex={-1} className="card p-6 md:p-8 anim-rise space-y-4 focus:outline-none">
        <Alert kind="ok">این ایمیل در لیست سفید هست و نیازی به درخواست ندارد؛ ثبت‌نام کن.</Alert>
        <Link href={state.email ? `/register?email=${encodeURIComponent(state.email)}` : "/register"} className="btn-primary w-full">
          ثبت‌نام
        </Link>
      </div>
    );
  }
  if (state.ok === "CREATED" || state.ok === "UPDATED") {
    return (
      <div ref={doneRef} tabIndex={-1} className="card p-6 md:p-8 anim-rise space-y-4 focus:outline-none">
        <Alert kind="ok">
          {state.ok === "CREATED" ? "درخواستت ثبت شد." : "درخواستت به‌روز شد و دوباره در صف بررسی قرار گرفت."} بعد از تأیید برگزارکننده،
          از صفحهٔ ثبت‌نام با همین ایمیل حسابت را بساز. وضعیت درخواستت را هر وقت خواستی در بخش «پیگیری وضعیت درخواست» همین صفحه ببین.
        </Alert>
        <a href="#access-status" className="btn-ghost w-full">پیگیری وضعیت درخواست</a>
      </div>
    );
  }

  const v = state.values;
  const invalid = state.error ? { "aria-invalid": true, "aria-describedby": "access-error" } : {};

  return (
    <form action={formAction} className="card p-6 md:p-8 anim-rise">
      <div className="grid gap-4">
        {state.error && (
          <div id="access-error">
            <Alert kind="error">{state.error}</Alert>
          </div>
        )}
        <div>
          <label className="label" htmlFor="email">ایمیل سازمانی</label>
          <input id="email" name="email" type="email" dir="ltr" autoComplete="email" className="input" defaultValue={v?.email ?? email} required maxLength={120} {...invalid} />
        </div>
        <div>
          <label className="label" htmlFor="phone">شمارهٔ موبایل</label>
          <input id="phone" name="phone" type="tel" dir="ltr" inputMode="tel" autoComplete="tel" className="input" placeholder="09xxxxxxxxx" defaultValue={v?.phone ?? phone} required maxLength={20} {...invalid} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="firstName">نام</label>
            <input id="firstName" name="firstName" autoComplete="given-name" className="input" defaultValue={v?.firstName} {...invalid} required minLength={2} maxLength={40} />
          </div>
          <div>
            <label className="label" htmlFor="lastName">نام خانوادگی</label>
            <input id="lastName" name="lastName" autoComplete="family-name" className="input" defaultValue={v?.lastName} {...invalid} required minLength={2} maxLength={40} />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="position">سمت</label>
          <input id="position" name="position" autoComplete="organization-title" className="input" defaultValue={v?.position} {...invalid} placeholder="مثلاً توسعه‌دهندهٔ بک‌اند" required minLength={2} maxLength={60} />
        </div>
        <div>
          <label className="label" htmlFor="unit">واحد سازمانی</label>
          <input id="unit" name="unit" list="unit-options" className="input" defaultValue={v?.unit} {...invalid} placeholder="مثلاً فنی / محصول / فروش" required minLength={2} maxLength={60} />
          <datalist id="unit-options">
            {DEPARTMENTS.map((d) => (
              <option key={d} value={d} />
            ))}
          </datalist>
        </div>
        <button type="submit" disabled={pending} className="btn-primary mt-2 w-full">
          {pending ? "در حال ارسال…" : "ارسال درخواست"}
        </button>
      </div>
      <p className="mt-6 text-center text-sm text-brand-slate">
        حساب داری؟{" "}
        <Link href="/login" className="font-bold text-brand-cyan-dark">وارد شو</Link>
      </p>
    </form>
  );
}
