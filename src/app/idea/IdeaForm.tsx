"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import Image from "next/image";
import { fa } from "@/lib/persian";
import { Alert } from "@/components/ui";
import { saveIdeaAction, unsubmitIdeaAction, type IdeaActionState } from "./actions";

type IdeaInput = {
  title: string;
  oneLiner: string;
  problem: string;
  audience: string;
  buildPlan: string;
  coverUrl: string;
  fundingCap: number;
  revenueShare: number;
};

function randomCover() {
  const seed = Math.random().toString(36).slice(2, 10);
  return `https://picsum.photos/seed/${seed}/800/500`;
}

function SubmitButtons() {
  const status = useFormStatus();
  const intent = status.pending ? String(status.data?.get("intent") ?? "") : "";
  return (
    <div className="flex flex-wrap gap-3 pt-2">
      <button type="submit" name="intent" value="draft" disabled={status.pending} className="btn-ghost">
        {status.pending && intent === "draft" ? "در حال ذخیره…" : "ذخیرهٔ پیش‌نویس"}
      </button>
      <button type="submit" name="intent" value="submit" disabled={status.pending} className="btn-primary">
        {status.pending && intent === "submit" ? "تحلیل‌گر در حال بررسی…" : "ثبت نهایی ایده"}
      </button>
    </div>
  );
}

export function IdeaForm({ initial }: { initial: IdeaInput | null }) {
  const [state, formAction] = useActionState<IdeaActionState, FormData>(saveIdeaAction, {});
  const [coverUrl, setCoverUrl] = useState(initial?.coverUrl ?? "");
  const [revenueShare, setRevenueShare] = useState(initial?.revenueShare ?? 30);

  return (
    <form action={formAction} className="card p-6 space-y-5 anim-rise">
      {state.error && <Alert kind="error">{state.error}</Alert>}
      {state.ok && <Alert kind="ok">ذخیره شد.</Alert>}

      <div>
        <label className="label" htmlFor="title">عنوان ایده</label>
        <input id="title" name="title" defaultValue={initial?.title} required className="input" placeholder="مثلاً: صف هوشمند کافه" />
      </div>

      <div>
        <label className="label" htmlFor="oneLiner">یک‌خطی (حداکثر ۱۲۰ نویسه)</label>
        <input id="oneLiner" name="oneLiner" defaultValue={initial?.oneLiner} required maxLength={120} className="input" placeholder="در یک جمله چه می‌سازید؟" />
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        <div>
          <label className="label" htmlFor="problem">مسئله</label>
          <textarea id="problem" name="problem" defaultValue={initial?.problem} required rows={4} className="input" placeholder="چه مشکلی را حل می‌کنید؟" />
        </div>
        <div>
          <label className="label" htmlFor="audience">مخاطب</label>
          <textarea id="audience" name="audience" defaultValue={initial?.audience} required rows={4} className="input" placeholder="مخاطب هدف شما کیست؟" />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="buildPlan">در ۴۸ ساعت چه چیزی ساخته می‌شود؟</label>
        <textarea id="buildPlan" name="buildPlan" defaultValue={initial?.buildPlan} required rows={4} className="input" placeholder="برنامهٔ ساخت را شرح دهید" />
      </div>

      <div>
        <label className="label" htmlFor="coverUrl">تصویر جلد</label>
        <div className="flex flex-wrap gap-3 items-start">
          <input
            id="coverUrl"
            name="coverUrl"
            value={coverUrl}
            onChange={(e) => setCoverUrl(e.target.value)}
            className="input flex-1 min-w-[220px]"
            placeholder="https://picsum.photos/seed/.../800/500"
          />
          <button type="button" className="btn-cyan shrink-0" onClick={() => setCoverUrl(randomCover())}>
            تصویر تصادفی
          </button>
        </div>
        {coverUrl && (
          <div className="mt-3 relative w-full max-w-md aspect-[8/5] rounded-2xl overflow-hidden border border-brand-mist anim-pop">
            <Image src={coverUrl} alt="پیش‌نمایش جلد" fill sizes="400px" className="object-cover" unoptimized />
          </div>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        <div>
          <label className="label" htmlFor="fundingCap">سقف سرمایه (۵۰ تا ۶۰۰ سکه)</label>
          <input
            id="fundingCap"
            name="fundingCap"
            type="number"
            min={50}
            max={600}
            step={10}
            defaultValue={initial?.fundingCap ?? 200}
            required
            className="input"
          />
        </div>
        <div>
          <label className="label" htmlFor="revenueShare">سهم سود سرمایه‌گذار: {fa(revenueShare)}٪</label>
          <input
            id="revenueShare"
            name="revenueShare"
            type="range"
            min={20}
            max={60}
            value={revenueShare}
            onChange={(e) => setRevenueShare(Number(e.target.value))}
            className="w-full accent-brand-red"
          />
          <p className="mt-1 text-xs text-brand-slate">
            از هر ۱۰۰ سکه فروش، {fa(revenueShare)} سکه به سرمایه‌گذاران می‌رسد.
          </p>
        </div>
      </div>

      <SubmitButtons />
    </form>
  );
}

export function UnsubmitButton() {
  const [state, formAction] = useActionState<IdeaActionState, FormData>(async () => unsubmitIdeaAction(), {});
  return (
    <form action={formAction}>
      {state.error && <Alert kind="error">{state.error}</Alert>}
      <button type="submit" className="btn-ghost">ویرایش</button>
    </form>
  );
}
