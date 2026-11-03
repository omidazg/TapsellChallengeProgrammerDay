"use client";

import { useState, type InputHTMLAttributes } from "react";
import { jdatetime } from "@/lib/persian";

/** ورودی datetime-local مرورگر میلادی است؛ زیرش همان زمان به تقویم شمسی نشان داده می‌شود. */
export function JalaliDateTimeInput(props: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [value, setValue] = useState(String(props.defaultValue ?? ""));
  const date = value ? new Date(value) : null;
  return (
    <>
      <input
        {...props}
        type="datetime-local"
        onChange={(e) => {
          setValue(e.target.value);
          props.onChange?.(e);
        }}
      />
      {date && !Number.isNaN(date.getTime()) && (
        <span className="mt-1 block text-xs text-brand-slate" aria-live="polite">
          {jdatetime(date)}
        </span>
      )}
    </>
  );
}
