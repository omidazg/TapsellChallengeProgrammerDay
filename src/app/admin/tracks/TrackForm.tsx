"use client";

import { startTransition, useActionState, useState } from "react";
import { Alert } from "@/components/ui";
import { fa } from "@/lib/persian";
import { MODULE_STATUSES, MODULE_STATUS_LABEL } from "@/lib/modules";
import { MARKET_SUB_LABEL, TRACK_KIND_LABEL, type JuryCriterion, type MarketSubWeights, type TrackKind, type TrackWeights } from "@/lib/tracks";
import { saveTrackAction, type TrackActionState } from "./actions";

export type TrackFormData = {
  id: string;
  name: string;
  description: string;
  kind: TrackKind;
  status: string;
  order: number;
  weights: TrackWeights;
  criteria: JuryCriterion[];
};

const PARTS = [
  { key: "ai", label: "هوش مصنوعی" },
  { key: "market", label: "بازار" },
  { key: "jury", label: "داوری" },
] as const;
const SUB_KEYS = Object.keys(MARKET_SUB_LABEL) as (keyof MarketSubWeights)[];

function SumNote({ sum }: { sum: number }) {
  return (
    <span className={`text-xs font-bold fa-num ${sum === 100 ? "text-emerald-600" : "text-brand-red"}`} role="status">
      جمع: {fa(sum)} از ۱۰۰
    </span>
  );
}

function WeightInput({ id, name, label, value, onChange }: { id: string; name: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="label" htmlFor={id}>{label}</label>
      <input
        id={id}
        name={name}
        type="number"
        inputMode="numeric"
        min={0}
        max={100}
        step={1}
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input !py-2 !px-3 w-full fa-num"
      />
    </div>
  );
}

export function TrackForm({ track }: { track: TrackFormData }) {
  const [state, formAction, pending] = useActionState<TrackActionState, FormData>(saveTrackAction, {});
  const [parts, setParts] = useState({
    ai: String(track.weights.ai),
    market: String(track.weights.market),
    jury: String(track.weights.jury),
  });
  const [subs, setSubs] = useState<Record<keyof MarketSubWeights, string>>({
    support: String(track.weights.marketSub.support),
    activeInstalls: String(track.weights.marketSub.activeInstalls),
    revenue: String(track.weights.marketSub.revenue),
    rating: String(track.weights.marketSub.rating),
    comments: String(track.weights.marketSub.comments),
  });
  const [criteria, setCriteria] = useState(track.criteria);
  const idp = `track-${track.id}`;

  const partSum = PARTS.reduce((a, p) => a + (Number(parts[p.key]) || 0), 0);
  const subSum = SUB_KEYS.reduce((a, k) => a + (Number(subs[k]) || 0), 0);

  const setCriterion = (i: number, patch: Partial<JuryCriterion>) =>
    setCriteria((list) => list.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const addCriterion = () =>
    setCriteria((list) => {
      let n = list.length + 1;
      while (list.some((c) => c.key === `c${n}`)) n++;
      return [...list, { key: `c${n}`, label: "" }];
    });

  return (
    <form
      // ارسال دستی: ری‌ست خودکار فرم (React 19) ورودی‌ها را پس از خطای اعتبارسنجی پاک می‌کرد.
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => formAction(data));
      }}
      className="card p-4 sm:p-6 space-y-5 anim-rise"
      aria-labelledby={`${idp}-title`}
    >
      <input type="hidden" name="trackId" value={track.id} />
      <div className="flex flex-wrap items-center gap-2">
        <h2 id={`${idp}-title`} className="text-lg font-black text-brand-navy break-words">{track.name}</h2>
        <span className="chip-navy">{TRACK_KIND_LABEL[track.kind]}</span>
        <span className="text-xs text-brand-slate" dir="ltr">{track.id}</span>
      </div>

      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
        <div>
          <label className="label" htmlFor={`${idp}-name`}>نام</label>
          <input id={`${idp}-name`} name="name" required maxLength={80} defaultValue={track.name} className="input" />
        </div>
        <div>
          <label className="label" htmlFor={`${idp}-status`}>وضعیت</label>
          <select id={`${idp}-status`} name="status" defaultValue={track.status} className="input">
            {MODULE_STATUSES.map((s) => (
              <option key={s} value={s}>{MODULE_STATUS_LABEL[s]}</option>
            ))}
          </select>
        </div>
        <div className="sm:w-24">
          <label className="label" htmlFor={`${idp}-order`}>ترتیب</label>
          <input id={`${idp}-order`} name="order" type="number" min={0} step={1} required defaultValue={track.order} className="input fa-num" />
        </div>
      </div>
      <div>
        <label className="label" htmlFor={`${idp}-desc`}>توضیح</label>
        <textarea id={`${idp}-desc`} name="description" rows={2} maxLength={1000} defaultValue={track.description} className="input w-full" />
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-black text-brand-navy flex flex-wrap items-center gap-3">
          سهم هر بخش از امتیاز <SumNote sum={partSum} />
        </legend>
        <div className="grid gap-3 grid-cols-3">
          {PARTS.map((p) => (
            <WeightInput key={p.key} id={`${idp}-${p.key}`} name={p.key} label={p.label} value={parts[p.key]} onChange={(v) => setParts((o) => ({ ...o, [p.key]: v }))} />
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-black text-brand-navy flex flex-wrap items-center gap-3">
          زیرشاخص‌های بازار <SumNote sum={subSum} />
        </legend>
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-5">
          {SUB_KEYS.map((k) => (
            <WeightInput key={k} id={`${idp}-${k}`} name={k} label={MARKET_SUB_LABEL[k]} value={subs[k]} onChange={(v) => setSubs((o) => ({ ...o, [k]: v }))} />
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-black text-brand-navy">معیارهای داوری</legend>
        <p className="text-xs text-brand-slate">
          هر داور به هر معیار از ۰ تا ۱۰ نمره می‌دهد. با تغییر کلید یک معیار، نمره‌های قبلی آن معیار دیگر حساب نمی‌شوند.
        </p>
        <ul className="space-y-2">
          {criteria.map((c, i) => (
            <li key={i} className="flex flex-wrap items-end gap-2">
              <div className="w-32">
                <label className="label" htmlFor={`${idp}-ck-${i}`}>کلید</label>
                <input
                  id={`${idp}-ck-${i}`}
                  name="criterionKey"
                  dir="ltr"
                  required
                  maxLength={40}
                  pattern="[a-zA-Z0-9_\-]+"
                  value={c.key}
                  onChange={(e) => setCriterion(i, { key: e.target.value })}
                  className="input !py-2 !px-3 w-full"
                />
              </div>
              <div className="flex-1 min-w-48">
                <label className="label" htmlFor={`${idp}-cl-${i}`}>عنوان</label>
                <input
                  id={`${idp}-cl-${i}`}
                  name="criterionLabel"
                  required
                  maxLength={160}
                  value={c.label}
                  onChange={(e) => setCriterion(i, { label: e.target.value })}
                  className="input !py-2 !px-3 w-full"
                />
              </div>
              <button
                type="button"
                onClick={() => setCriteria((list) => list.filter((_, j) => j !== i))}
                disabled={criteria.length <= 1}
                className="btn-ghost !py-2 !px-3 text-sm min-h-10 !text-brand-red disabled:opacity-40"
                aria-label={`حذف معیار ${c.label || c.key}`}
              >
                حذف
              </button>
            </li>
          ))}
        </ul>
        <button type="button" onClick={addCriterion} className="btn-ghost !py-2 !px-4 text-sm min-h-10">
          + افزودن معیار
        </button>
      </fieldset>

      {state.error && <Alert kind="error">{state.error}</Alert>}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? "در حال ذخیره…" : "ذخیرهٔ محور"}
        </button>
        {state.ok && !pending && <span className="text-emerald-600 text-xs font-bold" role="status">ذخیره شد</span>}
      </div>
    </form>
  );
}
