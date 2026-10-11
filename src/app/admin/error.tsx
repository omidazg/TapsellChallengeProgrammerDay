"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { Container } from "@/components/ui";

/**
 * مرز خطای پنل برگزارکننده. چون داخل بخش admin است، layout ادمین (ناوبری و نوار وضعیت) سر جایش می‌ماند
 * و فقط محتوای صفحه با این پیام جایگزین می‌شود. هم‌سبک با src/app/error.tsx.
 */
export default function AdminErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    console.error(error);
    // مدیریت فوکوس: با نمایش خطا، فوکوس به عنوان آن می‌رود تا صفحه‌خوان فوراً اعلامش کند.
    headingRef.current?.focus();
  }, [error]);

  return (
    <Container className="pt-10">
      <div className="mx-auto max-w-xl text-center anim-pop" role="alert">
        <div className="text-6xl mb-4" aria-hidden>
          ⚠️
        </div>
        <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-black text-brand-navy mb-2 outline-none">
          این بخش پنل با خطا روبه‌رو شد
        </h1>
        <p className="text-brand-slate mb-8">
          خطا ثبت شد. دوباره تلاش کن یا از منوی پنل به بخش دیگری برو؛ بقیهٔ پنل سالم است.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <button type="button" onClick={() => retry()} className="btn-primary">
            تلاش دوباره
          </button>
          <Link href="/admin" className="btn-ghost">
            بازگشت به پیشخوان پنل
          </Link>
        </div>
        {error.digest && (
          <p className="mt-8 text-xs text-brand-slate">
            کد خطا برای پیگیری: <bdi dir="ltr" className="font-mono select-all">{error.digest}</bdi>
          </p>
        )}
      </div>
    </Container>
  );
}
