"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { fa } from "@/lib/persian";
import { Alert } from "@/components/ui";
import { submitSurveyAction, type SurveyActionState } from "./actions";

type Initial = { rating: number; fun: number; learned: number; comment: string } | null;

function SubmitButton() {
  const status = useFormStatus();
  return (
    <button type="submit" disabled={status.pending} className="btn-primary w-full sm:w-auto">
      {status.pending ? "در حال ذخیره…" : "ثبت پاسخ"}
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
      <div role="radiogroup" aria-label={legend} className="flex flex-wrap gap-2">
        {[1, 2, 3, 4, 5].map((n) => {
          const checked = value === n;
          const id = `${name}-${n}`;
          return (
            <label
              key={n}
              htmlFor={id}
              className={`flex items-center justify-center size-11 rounded-full border font-black fa-num cursor-pointer transition ${
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
  const [state, formAction] = useActionState<SurveyActionState, FormData>(submitSurveyAction, {});
  const [rating, setRating] = useState(initial?.rating ?? 0);
  const [fun, setFun] = useState(initial?.fun ?? 0);
  const [learned, setLearned] = useState(initial?.learned ?? 0);
  const [comment, setComment] = useState(initial?.comment ?? "");

  return (
    <form action={formAction} className="card p-6 space-y-6 anim-rise">
      {state.error && <Alert kind="error">{state.error}</Alert>}
      {state.ok && <Alert kind="ok">پاسخت ذخیره شد؛ می‌توانی تا پایان بازی دوباره ویرایشش کنی.</Alert>}

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

      <SubmitButton />
    </form>
  );
}
