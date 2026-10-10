"use client";

import { startTransition, useActionState, useState } from "react";
import { fa } from "@/lib/persian";
import { Alert } from "@/components/ui";
import { submitSurveyAction, type SurveyActionState } from "./actions";

type Initial = { rating: number; fun: number; learned: number; comment: string } | null;

function SubmitButton({ pending }: { pending: boolean }) {
  return (
    <button type="submit" disabled={pending} className="btn-primary w-full sm:w-auto">
      {pending ? "در حال ذخیره…" : "ثبت پاسخ"}
    </button>
  );
}

function RatingGroup({
  name,
  legend,
  value,
  onChange,
}: {
  name: string;
  legend: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <fieldset>
      <legend className="label">{legend}</legend>
      <p className="-mt-1 mb-2 text-xs text-brand-slate">{fa(1)} = خیلی کم، {fa(5)} = خیلی زیاد</p>
      <div className="flex flex-wrap gap-2">
        {[1, 2, 3, 4, 5].map((n) => {
          const checked = value === n;
          const id = `${name}-${n}`;
          return (
            <label
              key={n}
              htmlFor={id}
              className={`flex items-center justify-center size-11 rounded-full border font-black fa-num cursor-pointer transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-cyan has-[:focus-visible]:ring-offset-2 ${
                checked ? "bg-brand-navy text-white border-brand-navy" : "border-brand-mist text-brand-navy hover:bg-brand-ice"
              }`}
            >
              <input
                id={id}
                type="radio"
                name={name}
                value={n}
                checked={checked}
                onChange={() => onChange(n)}
                className="sr-only"
                required
              />
              {fa(n)}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function SurveyForm({ initial }: { initial: Initial }) {
  const [state, formAction, pending] = useActionState<SurveyActionState, FormData>(submitSurveyAction, {});
  const [rating, setRating] = useState(initial?.rating ?? 0);
  const [fun, setFun] = useState(initial?.fun ?? 0);
  const [learned, setLearned] = useState(initial?.learned ?? 0);
  const [comment, setComment] = useState(initial?.comment ?? "");

  return (
    <form
      // ارسال دستی به‌جای action={formAction}: ری‌ست خودکار فرم (React 19) رادیوهای کنترل‌شده را در DOM
      // خالی می‌کند در حالی که state هنوز انتخاب را نشان می‌دهد؛ ویرایش بعدی بدون تازه‌کردن صفحه رد می‌شد.
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => formAction(data));
      }}
      className="card p-6 space-y-6 anim-rise"
    >
      {state.error && <Alert kind="error">{state.error}</Alert>}
      {state.ok && <Alert kind="ok">پاسخت ذخیره شد؛ هر وقت خواستی می‌توانی دوباره ویرایشش کنی.</Alert>}

      <RatingGroup name="rating" legend="رضایت کلی از بازی" value={rating} onChange={setRating} />
      <RatingGroup name="fun" legend="چقدر سرگرم‌کننده بود؟" value={fun} onChange={setFun} />
      <RatingGroup name="learned" legend="چقدر چیز یاد گرفتی؟" value={learned} onChange={setLearned} />

      <div>
        <label className="label" htmlFor="comment">نظر یا پیشنهاد (اختیاری)</label>
        <textarea
          id="comment"
          name="comment"
          className="input min-h-28"
          maxLength={1000}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="هر چیزی که فکر می‌کنی به دردمان می‌خورد…"
        />
        <div className="mt-1 text-left text-xs text-brand-slate fa-num">{fa(comment.length)}/{fa(1000)}</div>
      </div>

      <SubmitButton pending={pending} />
    </form>
  );
}
