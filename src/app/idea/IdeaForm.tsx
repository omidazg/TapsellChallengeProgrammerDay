"use client";

import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import Image from "next/image";
import { fa } from "@/lib/persian";
import { Alert } from "@/components/ui";
import { ImageUploadField } from "@/components/ImageUploadField";
import { useDraftAutosave, type DraftValues } from "@/hooks/useDraftAutosave";
import { isLocalUploadUrl, imageUrlError } from "@/lib/product-utils";
import { DraftBanner } from "../build/DraftBanner";
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

/** فیلدهایی که پیش‌نویس محلی‌شان ذخیره می‌شود */
const DRAFT_FIELDS = ["title", "oneLiner", "problem", "audience", "buildPlan", "coverUrl", "fundingCap", "revenueShare"] as const;

function SubmitButtons() {
  const status = useFormStatus();
  const intent = status.pending ? String(status.data?.get("intent") ?? "") : "";
  return (
    <div className="flex flex-col sm:flex-row flex-wrap gap-3 pt-2">
      <button type="submit" name="intent" value="draft" disabled={status.pending} className="btn-ghost w-full sm:w-auto">
        {status.pending && intent === "draft" ? "در حال ذخیره…" : "ذخیرهٔ پیش‌نویس"}
      </button>
      <button type="submit" name="intent" value="submit" disabled={status.pending} className="btn-primary w-full sm:w-auto">
        {status.pending && intent === "submit" ? "تحلیل‌گر در حال بررسی…" : "ثبت نهایی ایده"}
      </button>
    </div>
  );
}

export function IdeaForm({
  initial,
  draftKey,
}: {
  initial: IdeaInput | null;
  /** کلید پیش‌نویس محلی (بر پایهٔ تیم و شناسهٔ ایده) */
  draftKey: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [coverUrl, setCoverUrl] = useState(initial?.coverUrl ?? "");
  const [revenueShare, setRevenueShare] = useState(initial?.revenueShare ?? 30);

  // مقادیر فعلی سرور، به همان شکلی که در FormData ظاهر می‌شوند
  const baseline: DraftValues = {
    title: [initial?.title ?? ""],
    oneLiner: [initial?.oneLiner ?? ""],
    problem: [initial?.problem ?? ""],
    audience: [initial?.audience ?? ""],
    buildPlan: [initial?.buildPlan ?? ""],
    coverUrl: [initial?.coverUrl ?? ""],
    fundingCap: [String(initial?.fundingCap ?? 200)],
    revenueShare: [String(initial?.revenueShare ?? 30)],
  };
  const draft = useDraftAutosave({
    key: `idea:${draftKey}`,
    formRef,
    fields: DRAFT_FIELDS,
    baseline,
    controlled: {
      coverUrl: (vals) => setCoverUrl(vals[0] ?? ""),
      revenueShare: (vals) => {
        const n = Number(vals[0]);
        if (Number.isFinite(n)) setRevenueShare(Math.min(60, Math.max(20, Math.round(n))));
      },
    },
  });

  const [state, formAction] = useActionState<IdeaActionState, FormData>(async (prev, formData) => {
    const result = await saveIdeaAction(prev, formData);
    // پس از ذخیره/ثبت موفق، پیش‌نویس محلی دیگر لازم نیست
    if (result.ok) draft.clear();
    return result;
  }, {});
  // پس از خطا، مقادیر ارسالی برمی‌گردند تا ری‌ست خودکار فرم نوشته‌ها را پاک نکند
  const v = state.values ?? {};
  const coverError = imageUrlError(coverUrl);

  return (
    <form ref={formRef} action={formAction} className="card p-6 space-y-5 anim-rise">
      {draft.found && <DraftBanner savedAt={draft.found.savedAt} onRestore={draft.restore} onDismiss={draft.dismiss} />}
      {state.error && <Alert kind="error">{state.error}</Alert>}
      {state.ok && <Alert kind="ok">ذخیره شد.</Alert>}

      <div>
        <label className="label" htmlFor="title">عنوان ایده</label>
        <input id="title" name="title" defaultValue={v.title ?? initial?.title} required maxLength={80} className="input" placeholder="مثلاً: صف هوشمند کافه" />
      </div>

      <div>
        <label className="label" htmlFor="oneLiner">یک‌خطی (حداکثر ۱۲۰ نویسه)</label>
        <input id="oneLiner" name="oneLiner" defaultValue={v.oneLiner ?? initial?.oneLiner} required maxLength={120} className="input" placeholder="در یک جمله چه می‌سازید؟" />
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        <div>
          <label className="label" htmlFor="problem">مسئله</label>
          <textarea id="problem" name="problem" defaultValue={v.problem ?? initial?.problem} required maxLength={2000} rows={4} className="input" placeholder="چه مشکلی را حل می‌کنید؟" />
        </div>
        <div>
          <label className="label" htmlFor="audience">مخاطب</label>
          <textarea id="audience" name="audience" defaultValue={v.audience ?? initial?.audience} required maxLength={2000} rows={4} className="input" placeholder="مخاطب هدف شما کیست؟" />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="buildPlan">در ۴۸ ساعت چه چیزی ساخته می‌شود؟</label>
        <textarea id="buildPlan" name="buildPlan" defaultValue={v.buildPlan ?? initial?.buildPlan} required maxLength={2000} rows={4} className="input" placeholder="برنامهٔ ساخت را شرح دهید" />
      </div>

      <div>
        <label className="label" htmlFor="coverUrl">تصویر جلد</label>
        <div className="space-y-3">
          <ImageUploadField id="coverFile" onUploaded={(url) => setCoverUrl(url)} />
          <div className="flex flex-col sm:flex-row flex-wrap gap-3 items-stretch sm:items-start">
            <input
              id="coverUrl"
              name="coverUrl"
              value={coverUrl}
              onChange={(e) => setCoverUrl(e.target.value)}
              aria-invalid={coverError ? true : undefined}
              aria-describedby={coverError ? "coverUrlError" : undefined}
              className="input flex-1 min-w-0 sm:min-w-[220px]"
              placeholder="https://picsum.photos/seed/.../800/500 یا از دکمهٔ بالا آپلود کن"
            />
            <button type="button" className="btn-ghost shrink-0 w-full sm:w-auto" onClick={() => setCoverUrl(randomCover())}>
              تصویر تصادفی
            </button>
          </div>
          {coverError && (
            <p id="coverUrlError" className="text-xs text-brand-red">
              {coverError}
            </p>
          )}
        </div>
        {/* پیش‌نمایش: تصاویر آپلودی محلی با next/image بهینه می‌شوند؛ نشانی‌های دلخواه کاربر با تگ ساده (چون میزبانشان ممکن است مجاز next/image نباشد) */}
        {coverUrl && !coverError && (
          <div className="mt-3 relative w-full max-w-md aspect-[8/5] rounded-2xl overflow-hidden border border-brand-mist anim-pop bg-brand-sky">
            {isLocalUploadUrl(coverUrl) ? (
              <Image src={coverUrl} alt="پیش‌نمایش جلد" fill sizes="800px" className="object-cover" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={coverUrl} alt="پیش‌نمایش جلد" className="absolute inset-0 size-full object-cover" />
            )}
          </div>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        <div>
          <label className="label" htmlFor="fundingCap">هدف جذب سرمایه (۵۰ تا ۶۰۰ سکه)</label>
          <input
            id="fundingCap"
            name="fundingCap"
            type="number"
            min={50}
            max={600}
            step={10}
            defaultValue={v.fundingCap ?? initial?.fundingCap ?? 200}
            required
            className="input"
          />
          <p className="mt-1 text-xs text-brand-slate">
            این یک هدف است، نه سقف سخت؛ سرمایه‌گذاران می‌توانند بیشتر از این هم روی ایده‌ات بگذارند.
          </p>
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

function UnsubmitSubmit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-ghost">
      {pending ? "در حال باز کردن…" : "ویرایش"}
    </button>
  );
}

export function UnsubmitButton() {
  const [state, formAction] = useActionState<IdeaActionState, FormData>(unsubmitIdeaAction, {});
  return (
    <form action={formAction}>
      {state.error && <Alert kind="error">{state.error}</Alert>}
      <UnsubmitSubmit />
    </form>
  );
}
