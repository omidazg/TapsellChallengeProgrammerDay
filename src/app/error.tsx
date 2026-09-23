"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { Container } from "@/components/ui";

/**
 * مرز خطای سطح ریشه. طبق مستندات نکست‌جی‌اس ۱۶.۳ (`retry` prop از ۱۶.۳.۰ پایدار شده
 * و جایگزین `reset` توصیه می‌شود؛ تفاوت عملکردی برای این مورد استفاده وجود ندارد:
 * هر دو تلاش می‌کنند بخش را دوباره رندر کنند).
 */
export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    console.error(error);
    // مدیریت فوکوس: با نمایش UI خطا، فوکوس را به عنوان آن منتقل می‌کنیم تا کاربران
    // صفحه‌خوان بلافاصله متوجه خطا شوند.
    headingRef.current?.focus();
  }, [error]);

  return (
    <Container className="pt-16">
      <div className="mx-auto max-w-xl text-center anim-pop" role="alert">
        <div className="text-6xl mb-4" aria-hidden>
          ⚠️
        </div>
        <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-black text-brand-navy mb-2 outline-none">
          یک خطای غیرمنتظره پیش آمد
        </h1>
        <p className="text-brand-slate mb-8">
          نگران نباشید، این مشکل ثبت شد. می‌توانید دوباره تلاش کنید یا به خانه برگردید.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <button type="button" onClick={() => retry()} className="btn-primary">
            تلاش دوباره
          </button>
          <Link href="/" className="btn-ghost">
            بازگشت به خانه
          </Link>
        </div>
        {error.digest && (
          <p className="mt-8 text-xs text-brand-slate/70 fa-num" dir="ltr">
            کد خطا برای پشتیبانی: {error.digest}
          </p>
        )}
      </div>
    </Container>
  );
}
