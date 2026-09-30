"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Alert } from "@/components/ui";
import { DEPARTMENTS } from "@/app/register/departments";
import { submitAccessRequestAction, type AccessRequestState } from "./actions";

export function AccessRequestForm({ email, phone }: { email: string; phone: string }) {
  const [state, formAction, pending] = useActionState<AccessRequestState, FormData>(submitAccessRequestAction, {});

  if (state.ok === "HAS_ACCOUNT") {
    return (
      <div className="card p-6 md:p-8 anim-rise space-y-4">
        <Alert kind="info">با این ایمیل از قبل حساب ساخته شده؛ کافی است وارد شوی.</Alert>
        <Link href="/login" className="btn-primary w-full">ورود</Link>
      </div>
    );
  }
  if (state.ok === "ALLOWED") {
    return (
      <div className="card p-6 md:p-8 anim-rise space-y-4">
        <Alert kind="ok">این ایمیل در لیست سفید هست و نیازی به درخواست ندارد؛ ثبت‌نام کن.</Alert>
        <Link href="/register" className="btn-primary w-full">ثبت‌نام</Link>
      </div>
    );
  }
  if (state.ok === "CREATED" || state.ok === "UPDATED") {
    return (
      <div className="card p-6 md:p-8 anim-rise space-y-4">
        <Alert kind="ok">
          {state.ok === "CREATED" ? "درخواستت ثبت شد." : "درخواستت به‌روز شد و دوباره در صف بررسی قرار گرفت."} بعد از تأیید برگزارکننده،
          از صفحهٔ ثبت‌نام با همین ایمیل حسابت را بساز. برای دیدن وضعیت، کافی است در صفحهٔ ورود ایمیلت را وارد کنی.
        </Alert>
        <Link href="/login" className="btn-ghost w-full">بازگشت به ورود</Link>
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
