"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import Image from "next/image";
import { fa, coins } from "@/lib/persian";
import { Alert } from "@/components/ui";
import { DEFAULTS } from "@/lib/constants";
import { parseTeaser, randomPicsumUrl, MAX_IMAGES } from "@/lib/product-utils";
import { saveProductAction, type ProductActionState } from "./actions";

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
};

function SubmitButtons({ disabled }: { disabled: boolean }) {
  const status = useFormStatus();
  const intent = status.pending ? String(status.data?.get("intent") ?? "") : "";
  return (
    <div className="flex flex-wrap gap-3 pt-2">
      <button type="submit" name="intent" value="draft" disabled={disabled || status.pending} className="btn-ghost">
        {status.pending && intent === "draft" ? "در حال ذخیره…" : "ذخیرهٔ پیش‌نویس"}
      </button>
      <button type="submit" name="intent" value="submit" disabled={disabled || status.pending} className="btn-primary">
        {status.pending && intent === "submit" ? "داور هوش مصنوعی در حال بررسی…" : "ثبت نهایی محصول"}
      </button>
    </div>
  );
}

export function BuildForm({ editable, submitted, initial }: { editable: boolean; submitted: boolean; initial: ProductInput | null }) {
  const [state, formAction] = useActionState<ProductActionState, FormData>(saveProductAction, {});
  const [images, setImages] = useState<string[]>(initial?.images ?? []);
  const [teaserUrl, setTeaserUrl] = useState(initial?.teaserUrl ?? "");
  const [price, setPrice] = useState(initial?.price ?? 20);
  const [specialStart, setSpecialStart] = useState(initial?.specialStart ?? 20);
  const locked = !editable || submitted;
  const teaser = parseTeaser(teaserUrl);

  return (
    <form action={formAction} className="card p-6 space-y-6 anim-rise">
      {state.error && <Alert kind="error">{state.error}</Alert>}
      {state.ok && <Alert kind="ok">ذخیره شد.</Alert>}
      {!editable && <Alert kind="info">مرکز ساخت قفل شده و فقط قابل مشاهده است.</Alert>}

      <fieldset disabled={locked} className="space-y-6 disabled:opacity-70">
        <div className="grid md:grid-cols-2 gap-5">
          <div>
            <label className="label" htmlFor="name">نام محصول</label>
            <input id="name" name="name" defaultValue={initial?.name} required className="input" placeholder="مثلاً: صف‌یار" />
          </div>
          <div>
            <label className="label" htmlFor="tagline">تگ‌لاین</label>
            <input id="tagline" name="tagline" defaultValue={initial?.tagline} maxLength={160} className="input" placeholder="در یک جمله چه می‌کند؟" />
          </div>
        </div>

        <div>
          <label className="label" htmlFor="description">توضیح محصول</label>
          <textarea id="description" name="description" defaultValue={initial?.description} rows={6} className="input" placeholder="محصول را کامل توضیح بده (خط جدید مجاز است)" />
        </div>

        <div className="grid md:grid-cols-2 gap-5">
          <div>
            <label className="label" htmlFor="demoUrl">لینک دمو</label>
            <input id="demoUrl" name="demoUrl" defaultValue={initial?.demoUrl} className="input" placeholder="https://..." dir="ltr" />
          </div>
          <div>
            <label className="label" htmlFor="teaserUrl">لینک تیزر (یوتیوب، آپارات یا mp4)</label>
            <input
              id="teaserUrl"
              name="teaserUrl"
              value={teaserUrl}
              onChange={(e) => setTeaserUrl(e.target.value)}
              className="input"
              placeholder="https://..."
              dir="ltr"
            />
          </div>
        </div>

        {teaser.kind !== "none" && teaser.embedSrc && (
          <div className="relative w-full max-w-md aspect-video rounded-2xl overflow-hidden border border-brand-mist anim-pop bg-black">
            {teaser.kind === "video" ? (
              <video src={teaser.embedSrc} controls className="w-full h-full object-contain" />
            ) : (
              <iframe src={teaser.embedSrc} className="w-full h-full" allowFullScreen title="پیش‌نمایش تیزر" />
            )}
          </div>
        )}

        <ImagesField images={images} setImages={setImages} disabled={locked} />

        <div>
          <label className="label" htmlFor="price">قیمت ({fa(DEFAULTS.minPrice)} تا {fa(DEFAULTS.maxPrice)} سکه): {coins(price)}</label>
          <input
            id="price"
            name="price"
            type="range"
            min={DEFAULTS.minPrice}
            max={DEFAULTS.maxPrice}
            value={price}
            onChange={(e) => setPrice(Number(e.target.value))}
            className="w-full accent-brand-red"
          />
        </div>

        <div className="rounded-2xl border border-brand-mist p-4 space-y-4">
          <div className="text-sm font-black text-brand-navy">نسخهٔ ویژه (برای حراج زنده)</div>
          <div className="grid md:grid-cols-2 gap-5">
            <div>
              <label className="label" htmlFor="specialName">نام نسخهٔ ویژه</label>
              <input id="specialName" name="specialName" defaultValue={initial?.specialName} maxLength={80} className="input" placeholder="مثلاً: نسخهٔ طلایی" />
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
            <textarea id="specialDesc" name="specialDesc" defaultValue={initial?.specialDesc} rows={3} className="input" placeholder="این نسخه چه امتیاز اضافه‌ای دارد؟" />
          </div>
        </div>
      </fieldset>

      {editable && <SubmitButtons disabled={submitted} />}
    </form>
  );
}

function ImagesField({ images, setImages, disabled }: { images: string[]; setImages: (v: string[]) => void; disabled: boolean }) {
  const [draft, setDraft] = useState("");

  function addImage(url: string) {
    const v = url.trim();
    if (!v || images.length >= MAX_IMAGES) return;
    setImages([...images, v]);
    setDraft("");
  }
  function removeImage(idx: number) {
    setImages(images.filter((_, i) => i !== idx));
  }

  return (
    <div>
      <label className="label">تصاویر (حداقل ۳، حداکثر {fa(MAX_IMAGES)})</label>
      {images.map((url) => (
        <input key={url} type="hidden" name="images" value={url} />
      ))}
      <div className="flex flex-wrap gap-3 items-center">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={disabled || images.length >= MAX_IMAGES}
          className="input flex-1 min-w-[220px]"
          placeholder="https://picsum.photos/seed/.../800/500"
          dir="ltr"
        />
        <button type="button" disabled={disabled || !draft.trim() || images.length >= MAX_IMAGES} className="btn-cyan shrink-0" onClick={() => addImage(draft)}>
          افزودن
        </button>
        <button
          type="button"
          disabled={disabled || images.length >= MAX_IMAGES}
          className="btn-ghost shrink-0"
          onClick={() => addImage(randomPicsumUrl())}
        >
          تصویر تصادفی
        </button>
      </div>

      {images.length > 0 && (
        <div className="mt-4 grid grid-cols-3 sm:grid-cols-4 gap-3 stagger">
          {images.map((url, idx) => (
            <div key={url + idx} className="relative aspect-square rounded-xl overflow-hidden border border-brand-mist group anim-pop">
              <Image src={url} alt={`تصویر ${idx + 1}`} fill sizes="200px" className="object-cover" unoptimized />
              {!disabled && (
                <button
                  type="button"
                  onClick={() => removeImage(idx)}
                  className="absolute top-1 left-1 size-6 rounded-full bg-brand-navy/80 text-white text-xs flex items-center justify-center hover:bg-brand-red"
                  aria-label="حذف تصویر"
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
