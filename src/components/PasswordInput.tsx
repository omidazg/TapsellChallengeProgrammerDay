"use client";

import { useState } from "react";

type Props = Omit<React.ComponentProps<"input">, "type" | "dir">;

/**
 * فیلد رمز با دکمهٔ نمایش/پنهان. متن رمز چپ‌به‌راست است، پس دکمه در انتهای فیلد (سمت راست)
 * می‌نشیند؛ برای همین کل قاب dir="ltr" دارد و از جهت‌های منطقی (pe/end) استفاده می‌شود.
 * برچسب دکمه ثابت است و وضعیت با aria-pressed اعلام می‌شود.
 */
export function PasswordInput({ className = "", ...props }: Props) {
  const [visible, setVisible] = useState(false);

  return (
    <div dir="ltr" className="relative">
      <input {...props} type={visible ? "text" : "password"} dir="ltr" className={`input pe-12 ${className}`} />
      <button
        type="button"
        aria-label="نمایش رمز"
        aria-pressed={visible}
        aria-controls={props.id}
        title={visible ? "پنهان کردن رمز" : "نمایش رمز"}
        onClick={() => setVisible((v) => !v)}
        // فوکوس (و مکان‌نمای) فیلد با کلیک موس از دست نرود
        onMouseDown={(e) => e.preventDefault()}
        className="absolute end-1 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-xl text-brand-slate transition hover:bg-brand-ice hover:text-brand-navy focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
      >
        {visible ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  );
}

function EyeIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.9 5.2A9.7 9.7 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-2.6 3.6M6.6 6.6A17.4 17.4 0 0 0 2 12s3.5 7 10 7a9.6 9.6 0 0 0 5.4-1.6" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      <path d="m2 2 20 20" />
    </svg>
  );
}
