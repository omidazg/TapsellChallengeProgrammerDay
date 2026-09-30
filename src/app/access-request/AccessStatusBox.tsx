"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Alert } from "@/components/ui";
import { checkAccessStatusAction, type AccessStatusResult } from "./actions";

/** پیگیری وضعیت درخواست دسترسی با ایمیل؛ فقط وضعیت نمایش داده می‌شود */
export function AccessStatusBox({ defaultEmail = "" }: { defaultEmail?: string }) {
  const [email, setEmail] = useState(defaultEmail);
  const [result, setResult] = useState<(AccessStatusResult & { email: string }) | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const typed = email.trim();
    startTransition(async () => {
      try {
        const res = await checkAccessStatusAction(typed);
        setResult({ ...res, email: typed.toLowerCase() });
      } catch {
        setResult({ error: "بررسی وضعیت انجام نشد؛ دوباره تلاش کن.", email: typed });
      }
    });
  }

  const hasError = !!result && "error" in result;

  return (
    <section id="access-status" aria-labelledby="access-status-title" className="card scroll-mt-24 p-6 anim-rise">
      <h2 id="access-status-title" className="text-base font-black text-brand-navy">پیگیری وضعیت درخواست</h2>
      <p className="mt-1 text-sm text-brand-slate">قبلاً درخواست داده‌ای؟ ایمیلت را بزن تا وضعیتش را ببینی.</p>
      <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-2 sm:flex-row" noValidate>
        <label className="sr-only" htmlFor="status-email">ایمیل درخواست</label>
        <input
          id="status-email"
          type="email"
          dir="ltr"
          autoComplete="email"
          maxLength={120}
          className="input flex-1"
          placeholder="ایمیل سازمانی‌ات"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          aria-invalid={hasError || undefined}
          aria-describedby="access-status-result"
        />
        <button type="submit" disabled={pending || !email.trim()} className="btn-cyan whitespace-nowrap">
          {pending ? "در حال بررسی…" : "بررسی وضعیت"}
        </button>
      </form>
      {/* ناحیهٔ زنده همیشه در DOM می‌ماند تا صفحه‌خوان تغییر محتوایش را اعلام کند */}
      <div id="access-status-result" aria-live="polite" className="empty:hidden mt-4">
        {result && <StatusMessage result={result} />}
      </div>
    </section>
  );
}

function StatusMessage({ result }: { result: AccessStatusResult & { email: string } }) {
  if ("error" in result) return <Alert kind="error">{result.error}</Alert>;
  const closed = !result.registrationOpen && (
    <> فاز ثبت‌نام الان بسته است؛ ساخت حساب وقتی ممکن می‌شود که برگزارکننده ثبت‌نام را دوباره باز کند.</>
  );
  switch (result.status) {
    case "PENDING":
      return <Alert kind="info">در انتظار بررسی — درخواستت در صف است و هنوز برگزارکننده بررسی‌اش نکرده.</Alert>;
    case "ALLOWED":
      return (
        <div className="space-y-3">
          <Alert kind="ok">تأیید شده — می‌توانی با همین ایمیل ثبت‌نام کنی.{closed}</Alert>
          {result.registrationOpen && (
            <Link href={`/register?email=${encodeURIComponent(result.email)}`} className="btn-primary w-full">
              ثبت‌نام
            </Link>
          )}
        </div>
      );
    case "REJECTED":
      return (
        <Alert kind="error">
          رد شده — اگر فکر می‌کنی اشتباهی رخ داده، فرم بالا را با اطلاعات درست دوباره بفرست یا با برگزارکننده تماس بگیر.
        </Alert>
      );
    case "HAS_ACCOUNT":
      return (
        <div className="space-y-3">
          <Alert kind="info">با این ایمیل از قبل حساب ساخته شده؛ کافی است وارد شوی.</Alert>
          <Link href={`/login?email=${encodeURIComponent(result.email)}`} className="btn-primary w-full">
            ورود
          </Link>
        </div>
      );
    default:
      return <Alert kind="info">درخواستی با این ایمیل پیدا نشد. اگر هنوز درخواست نداده‌ای، فرم بالا را پر کن.</Alert>;
  }
}
