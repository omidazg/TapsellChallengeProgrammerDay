"use client";

import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import Image from "next/image";
import { fa, coins } from "@/lib/persian";
import { Alert } from "@/components/ui";
import { ImageUploadField } from "@/components/ImageUploadField";
import { useDraftAutosave, type DraftValues } from "@/hooks/useDraftAutosave";
import { DEFAULTS } from "@/lib/constants";
import { parseTeaser, randomImageUrl, MAX_IMAGES, isLocalUploadUrl, imageUrlError } from "@/lib/product-utils";
import { ENTRY_CATEGORY_LABEL, type TrackCategory, type TrackKind } from "@/lib/tracks";
import { saveProductAction, type ProductActionState } from "./actions";
import { DraftBanner } from "./DraftBanner";
import { ChecklistLink } from "./ChecklistLink";

type ProductInput = {
  name: string;
  tagline: string;
  description: string;
  demoUrl: string;
  teaserUrl: string;
  images: string[];
  price: number;
  specialName: string;
  specialDesc: string;
  specialStart: number;
  category: string;
  deliverableUrl: string;
  contentType: string;
  osIssueId: string;
  preExistingNote: string;
};

export type OsIssueOption = { id: string; title: string; url: string };

/** پیشنهادهای نوع محتوا؛ کاربر آزاد است هر چیز دیگری بنویسد */
const CONTENT_TYPE_SUGGESTIONS = ["ویدیو", "پادکست", "دورهٔ آموزشی", "پست شبکه‌های اجتماعی", "فیلم", "موسیقی", "برنامهٔ دنباله‌دار", "راهکار اختصاصی تولید محتوا"];

/** فیلدهایی که پیش‌نویس محلی‌شان ذخیره می‌شود؛ بسته به نوع محور فرق دارند */
function draftFields(kind: TrackKind, category: TrackCategory, hasIssues: boolean): string[] {
  const base = ["name", "tagline", "description", "images", "price", "preExistingNote"];
  if (kind === "CONTENT") return [...base, "contentType", "deliverableUrl"];
  if (kind === "OS") return [...base, "deliverableUrl", ...(hasIssues ? ["osIssueId"] : [])];
  return [...base, "demoUrl", "teaserUrl", "specialName", "specialDesc", "specialStart", ...(category === "MIXED" ? ["category"] : [])];
}

const NAME_LABEL: Record<TrackKind, { name: string; description: string; descriptionHint: string }> = {
  PRODUCT: { name: "نام محصول", description: "توضیح محصول", descriptionHint: "محصول را کامل توضیح بده (خط جدید مجاز است)" },
  CONTENT: { name: "عنوان محتوا", description: "توضیح محتوا", descriptionHint: "این محتوا دربارهٔ چیست و برای چه کسی است؟" },
  OS: { name: "عنوان راهکار", description: "شرح راهکار", descriptionHint: "چه مشکلی را حل کردی و راهکارت چطور کار می‌کند؟" },
};

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(n)));
}

function SubmitButtons({ disabled }: { disabled: boolean }) {
  const status = useFormStatus();
  const intent = status.pending ? String(status.data?.get("intent") ?? "") : "";
  return (
    <div className="flex flex-col sm:flex-row flex-wrap gap-3 pt-2">
      <button type="submit" name="intent" value="draft" disabled={disabled || status.pending} className="btn-ghost w-full sm:w-auto">
        {status.pending && intent === "draft" ? "در حال ذخیره…" : "ذخیرهٔ پیش‌نویس"}
      </button>
      <button id="productFinalSubmit" type="submit" name="intent" value="submit" disabled={disabled || status.pending} className="btn-primary w-full sm:w-auto">
        {status.pending && intent === "submit" ? "داور هوش مصنوعی در حال بررسی…" : "ثبت نهایی محصول"}
      </button>
    </div>
  );
}

export function BuildForm({
  trackId,
  trackKind,
  trackCategory,
  osIssues,
  draftKey,
  editable,
  submitted,
  initial,
  maxPrice = DEFAULTS.maxPrice,
  lockNote = "این فرم الان قابل ویرایش نیست و فقط قابل مشاهده است.",
}: {
  trackId: string;
  trackKind: TrackKind;
  trackCategory: TrackCategory;
  /** ایشوهای فعال محور OS؛ اگر خالی باشد تیم راهکارش را آزاد شرح می‌دهد */
  osIssues: OsIssueOption[];
  /** کلید پیش‌نویس محلی (بر پایهٔ تیم، محور و شناسهٔ محصول) */
  draftKey: string;
  editable: boolean;
  /** پیام نمایش‌داده‌شده وقتی فرم قابل ویرایش نیست */
  lockNote?: string | null;
  submitted: boolean;
  initial: ProductInput | null;
  /** سقف مؤثر قیمت (effectiveMaxPrice)؛ از سرور محاسبه و پاس داده می‌شود. */
  maxPrice?: number;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [images, setImages] = useState<string[]>(initial?.images ?? []);
  const [teaserUrl, setTeaserUrl] = useState(initial?.teaserUrl ?? "");
  const [price, setPrice] = useState(() => Math.min(initial?.price ?? 20, maxPrice));
  const [specialStart, setSpecialStart] = useState(initial?.specialStart ?? 20);
  const locked = !editable || submitted;
  const labels = NAME_LABEL[trackKind];
  const isProduct = trackKind === "PRODUCT";

  // مقادیر فعلی سرور، به همان شکلی که در FormData ظاهر می‌شوند
  const baseline: DraftValues = {
    name: [initial?.name ?? ""],
    tagline: [initial?.tagline ?? ""],
    description: [initial?.description ?? ""],
    demoUrl: [initial?.demoUrl ?? ""],
    teaserUrl: [initial?.teaserUrl ?? ""],
    images: initial?.images ?? [],
    price: [String(Math.min(initial?.price ?? 20, maxPrice))],
    specialName: [initial?.specialName ?? ""],
    specialDesc: [initial?.specialDesc ?? ""],
    specialStart: [String(initial?.specialStart ?? 20)],
    category: [initial?.category ?? ""],
    deliverableUrl: [initial?.deliverableUrl ?? ""],
    contentType: [initial?.contentType ?? ""],
    osIssueId: [initial?.osIssueId ?? ""],
    preExistingNote: [initial?.preExistingNote ?? ""],
  };
  const draft = useDraftAutosave({
    key: `build:${draftKey}`,
    formRef,
    fields: draftFields(trackKind, trackCategory, osIssues.length > 0),
    baseline,
    enabled: !locked,
    controlled: {
      teaserUrl: (vals) => setTeaserUrl(vals[0] ?? ""),
      images: (vals) => setImages(Array.from(new Set(vals.map((u) => u.trim()))).filter((u) => u && !imageUrlError(u)).slice(0, MAX_IMAGES)),
      price: (vals) => {
        const n = Number(vals[0]);
        if (Number.isFinite(n)) setPrice(clamp(n, DEFAULTS.minPrice, maxPrice));
      },
      specialStart: (vals) => {
        const n = Number(vals[0]);
        if (Number.isFinite(n)) setSpecialStart(clamp(n, 5, 100));
      },
    },
  });

  const [state, formAction] = useActionState<ProductActionState, FormData>(async (prev, formData) => {
    const result = await saveProductAction(prev, formData);
    // پس از ذخیره/ثبت موفق، پیش‌نویس محلی دیگر لازم نیست
    if (result.ok) draft.clear();
    return result;
  }, {});
  const teaser = parseTeaser(teaserUrl);
  // پس از خطا، مقادیر ارسالی برمی‌گردند تا ری‌ست خودکار فرم نوشته‌ها را پاک نکند
  const v = state.values ?? {};

  return (
    <form ref={formRef} action={formAction} className="card p-6 space-y-6 anim-rise">
      <input type="hidden" name="trackId" value={trackId} />
      {draft.found && <DraftBanner savedAt={draft.found.savedAt} onRestore={draft.restore} onDismiss={draft.dismiss} />}
      {state.error &&
        (state.missing && state.missing.length > 0 ? (
          <Alert kind="error">
            پیش از ثبت نهایی، این موارد چک‌لیست را کامل کن:{" "}
            {state.missing.map((m, i) => (
              <span key={m.fieldId}>
                {i > 0 && "، "}
                <ChecklistLink fieldId={m.fieldId} className="underline underline-offset-4 hover:no-underline">
                  {m.label}
                </ChecklistLink>
              </span>
            ))}
          </Alert>
        ) : (
          <Alert kind="error">{state.error}</Alert>
        ))}
      {state.ok && <Alert kind="ok">ذخیره شد.{state.notice ? ` ${state.notice}` : ""}</Alert>}
      {!editable && lockNote && <Alert kind="info">{lockNote}</Alert>}

      <fieldset disabled={locked} className="space-y-6 disabled:opacity-70">
        <div className="grid md:grid-cols-2 gap-5">
          <div>
            <label className="label" htmlFor="name">{labels.name}</label>
            <input id="name" name="name" defaultValue={v.name ?? initial?.name} required maxLength={80} className="input" placeholder="مثلاً: صف‌یار" />
          </div>
          <div>
            <label className="label" htmlFor="tagline">تگ‌لاین</label>
            <input id="tagline" name="tagline" defaultValue={v.tagline ?? initial?.tagline} maxLength={160} className="input" placeholder="در یک جمله چه می‌کند؟" />
          </div>
        </div>

        <div>
          <label className="label" htmlFor="description">{labels.description}</label>
          <textarea id="description" name="description" defaultValue={v.description ?? initial?.description} maxLength={4000} rows={6} className="input" placeholder={labels.descriptionHint} />
        </div>

        {isProduct && trackCategory === "MIXED" && (
          <div>
            <label className="label" htmlFor="category">دسته</label>
            <select id="category" name="category" defaultValue={v.category ?? initial?.category ?? ""} className="input">
              <option value="">انتخاب کن…</option>
              <option value="TECH">{ENTRY_CATEGORY_LABEL.TECH}</option>
              <option value="NON_TECH">{ENTRY_CATEGORY_LABEL.NON_TECH}</option>
            </select>
            <p className="mt-1 text-xs text-brand-slate">جایزهٔ نفر اول این محور برای هر دسته جداست.</p>
          </div>
        )}

        {trackKind === "CONTENT" && (
          <div className="grid md:grid-cols-2 gap-5">
            <div>
              <label className="label" htmlFor="contentType">نوع محتوا</label>
              <input id="contentType" name="contentType" list="contentTypeSuggestions" defaultValue={v.contentType ?? initial?.contentType} maxLength={80} className="input" placeholder="مثلاً ویدیو، پادکست، یا هر چیز دیگر" />
              <datalist id="contentTypeSuggestions">
                {CONTENT_TYPE_SUGGESTIONS.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="label" htmlFor="deliverableUrl">لینک محتوای تولیدشده</label>
              <input id="deliverableUrl" name="deliverableUrl" type="url" defaultValue={v.deliverableUrl ?? initial?.deliverableUrl} maxLength={500} className="input" placeholder="https://…" dir="ltr" />
            </div>
          </div>
        )}

        {trackKind === "OS" && (
          <div className="grid md:grid-cols-2 gap-5">
            {osIssues.length > 0 && (
              <div>
                <label className="label" htmlFor="osIssueId">ایشوی انتخابی</label>
                <select id="osIssueId" name="osIssueId" defaultValue={v.osIssueId ?? initial?.osIssueId ?? ""} className="input">
                  <option value="">انتخاب کن…</option>
                  {osIssues.map((i) => (
                    <option key={i.id} value={i.id}>{i.title}</option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-brand-slate">چند تیم می‌توانند یک ایشو را بردارند؛ بهترین راهکار برنده است.</p>
              </div>
            )}
            <div>
              <label className="label" htmlFor="deliverableUrl">لینک PR یا MR</label>
              <input id="deliverableUrl" name="deliverableUrl" type="url" defaultValue={v.deliverableUrl ?? initial?.deliverableUrl} maxLength={500} className="input" placeholder="https://…" dir="ltr" />
            </div>
          </div>
        )}

        {isProduct && (
        <div className="grid md:grid-cols-2 gap-5">
          <div>
            <label className="label" htmlFor="demoUrl">لینک دمو</label>
            <input id="demoUrl" name="demoUrl" type="url" defaultValue={v.demoUrl ?? initial?.demoUrl} maxLength={500} className="input" placeholder="https://…" dir="ltr" />
          </div>
          <div>
            <label className="label" htmlFor="teaserUrl">لینک تیزر (یوتیوب، آپارات یا mp4)</label>
            <input
              id="teaserUrl"
              name="teaserUrl"
              value={teaserUrl}
              onChange={(e) => setTeaserUrl(e.target.value)}
              className="input"
              placeholder="https://…"
              dir="ltr"
            />
          </div>
        </div>
        )}

        {isProduct && teaser.kind === "video" && teaser.embedSrc && (
          <p className="text-xs text-brand-slate">
            این لینک یوتیوب یا آپارات نیست؛ در صفحهٔ محصول به‌جای پخش‌کننده، دکمهٔ «تماشای تیزر» نشان داده می‌شود.
          </p>
        )}
        {isProduct && (teaser.kind === "youtube" || teaser.kind === "aparat") && teaser.embedSrc && (
          <div className="relative w-full max-w-md aspect-video rounded-2xl overflow-hidden border border-brand-mist anim-pop bg-black">
            <iframe src={teaser.embedSrc} className="w-full h-full" allowFullScreen title="پیش‌نمایش تیزر" />
          </div>
        )}

        <ImagesField images={images} setImages={setImages} disabled={locked} required={isProduct} />

        <div>
          <label className="label" htmlFor="price">قیمت ({fa(DEFAULTS.minPrice)} تا {fa(maxPrice)} سکه): {coins(price)}</label>
          <input
            id="price"
            name="price"
            type="range"
            min={DEFAULTS.minPrice}
            max={maxPrice}
            value={price}
            onChange={(e) => setPrice(Number(e.target.value))}
            className="w-full accent-brand-red"
          />
        </div>

        {/* محور غیر ساخت محصول نسخهٔ ویژه ندارد؛ اکشن همچنان قیمت شروع معتبر لازم دارد */}
        {!isProduct && <input type="hidden" name="specialStart" value={initial?.specialStart ?? 20} />}

        {isProduct && (
        <div className="rounded-2xl border border-brand-mist p-4 space-y-4">
          <div>
            <div className="text-sm font-black text-brand-navy">نسخهٔ ویژه (برای حراج زنده)</div>
            <p className="mt-1 text-xs text-brand-slate">
              پس از ثبت نهایی، هر عضو تیم می‌تواند این نسخه را از صفحهٔ محصول یا صفحهٔ حراج به صف حراج زنده بفرستد؛ حراج از «قیمت شروع» آغاز می‌شود.
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-5">
            <div>
              <label className="label" htmlFor="specialName">نام نسخهٔ ویژه</label>
              <input id="specialName" name="specialName" defaultValue={v.specialName ?? initial?.specialName} maxLength={80} className="input" placeholder="مثلاً: نسخهٔ طلایی" />
            </div>
            <div>
              <label className="label" htmlFor="specialStart">قیمت شروع حراج ({fa(5)} تا {fa(100)}): {coins(specialStart)}</label>
              <input
                id="specialStart"
                name="specialStart"
                type="range"
                min={5}
                max={100}
                value={specialStart}
                onChange={(e) => setSpecialStart(Number(e.target.value))}
                className="w-full accent-brand-cyan"
              />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="specialDesc">توضیح نسخهٔ ویژه</label>
            <textarea id="specialDesc" name="specialDesc" defaultValue={v.specialDesc ?? initial?.specialDesc} maxLength={400} rows={3} className="input" placeholder="این نسخه چه امتیاز اضافه‌ای دارد؟" />
          </div>
        </div>
        )}

        <div>
          <label className="label" htmlFor="preExistingNote">کد متن‌باز یا کار پیش از مسابقه (اگر دارد)</label>
          <textarea id="preExistingNote" name="preExistingNote" defaultValue={v.preExistingNote ?? initial?.preExistingNote} maxLength={1000} rows={2} className="input" placeholder="مثلاً کتابخانهٔ متن‌باز X یا نمونهٔ اولیه‌ای که قبل از مسابقه ساخته بودیم" />
          <p className="mt-1 text-xs text-brand-slate">استفاده از این‌ها مجاز است ولی باید همین‌جا اعلام شود؛ کار اعلام‌شده مشمول انتقال مالکیت نمی‌شود.</p>
        </div>
      </fieldset>

      {editable && <SubmitButtons disabled={submitted} />}
    </form>
  );
}

function ImagesField({ images, setImages, disabled, required }: { images: string[]; setImages: React.Dispatch<React.SetStateAction<string[]>>; disabled: boolean; required: boolean }) {
  const [draft, setDraft] = useState("");
  const [urlError, setUrlError] = useState("");
  const full = images.length >= MAX_IMAGES;

  /** افزودن تصویر با اعتبارسنجی فوری (همان قاعدهٔ سرور)؛ خطا کنار فیلد نمایش داده می‌شود */
  function addImage(url: string, fromDraft = false) {
    const v = url.trim();
    if (!v) return;
    const err = full
      ? `حداکثر ${fa(MAX_IMAGES)} تصویر مجاز است`
      : images.includes(v)
        ? "این تصویر قبلاً افزوده شده است"
        : imageUrlError(v);
    if (err) {
      // خطای نشانیِ تایپ‌شده کنار همان فیلد نشان داده می‌شود؛ خطای آپلود را خود ImageUploadField نشان می‌دهد
      if (fromDraft) setUrlError(err);
      return;
    }
    // تصویر تکراری افزوده نمی‌شود (کلید تکراری و شمارش نادرست در چک‌لیست)
    setImages((prev) => (prev.length >= MAX_IMAGES || prev.includes(v) ? prev : [...prev, v]));
    if (fromDraft) {
      setDraft("");
      setUrlError("");
    }
  }
  function removeImage(idx: number) {
    setImages((prev) => prev.filter((_, i) => i !== idx));
  }

  return (
    <div>
      <label className="label" htmlFor="productImageUrl">
        تصاویر ({required ? "حداقل ۳، " : "اختیاری، "}حداکثر {fa(MAX_IMAGES)}) — {fa(images.length)} تصویر افزوده شده
      </label>
      {images.map((url) => (
        <input key={url} type="hidden" name="images" value={url} />
      ))}

      <div className="mb-3">
        <ImageUploadField id="productImageFile" disabled={disabled || full} onUploaded={(url) => addImage(url)} />
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <input
          id="productImageUrl"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (urlError) setUrlError("");
          }}
          onKeyDown={(e) => {
            // Enter در این فیلد نباید کل فرم را ذخیره کند؛ تصویر را اضافه می‌کند
            if (e.key === "Enter") {
              e.preventDefault();
              addImage(draft, true);
            }
          }}
          disabled={disabled || full}
          aria-invalid={urlError ? true : undefined}
          aria-describedby={urlError ? "productImageUrlError" : undefined}
          className="input flex-1 min-w-[220px]"
          placeholder="https://… یا «تصویر تصادفی»"
          dir="ltr"
        />
        <button type="button" disabled={disabled || !draft.trim() || full} className="btn-cyan shrink-0" onClick={() => addImage(draft, true)}>
          افزودن
        </button>
        <button type="button" disabled={disabled || full} className="btn-ghost shrink-0" onClick={() => addImage(randomImageUrl())}>
          تصویر تصادفی
        </button>
      </div>
      {urlError && (
        <p id="productImageUrlError" role="alert" className="mt-1 text-xs text-brand-red">
          {urlError}
        </p>
      )}

      {images.length > 0 && (
        <div className="mt-4 flex gap-3 overflow-x-auto no-scrollbar sm:grid sm:grid-cols-4 sm:overflow-visible stagger">
          {images.map((url, idx) => (
            <div key={url + idx} className="relative aspect-square size-24 shrink-0 rounded-xl overflow-hidden border border-brand-mist group anim-pop sm:size-auto sm:w-full sm:shrink">
              <Image src={url} alt={`تصویر ${fa(idx + 1)}`} fill sizes="200px" className="object-cover" unoptimized={!isLocalUploadUrl(url)} />
              {!disabled && (
                <button
                  type="button"
                  onClick={() => removeImage(idx)}
                  className="absolute top-0 left-0 isolate size-11 flex items-center justify-center text-white text-xs before:absolute before:inset-2 before:-z-10 before:rounded-full before:bg-brand-navy/80 hover:before:bg-brand-red"
                  aria-label={`حذف تصویر ${fa(idx + 1)}`}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
