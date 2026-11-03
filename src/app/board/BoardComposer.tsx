"use client";

import Image from "next/image";
import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui";
import { ImageUploadField } from "@/components/ImageUploadField";
import { BOARD_BODY_MAX, BOARD_KINDS, BOARD_KIND_LABEL, type BoardKind } from "@/lib/community";
import { isLocalUploadUrl } from "@/lib/product-utils";
import { createPostAction, type BoardActionState } from "./actions";

/** فرم نوشتن پست در بورد خبر (برای اعضای تیم) */
export function BoardComposer({ products }: { products: { id: string; name: string }[] }) {
  const [state, formAction, pending] = useActionState<BoardActionState, FormData>(createPostAction, {});
  const [imageUrl, setImageUrl] = useState("");
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<BoardKind>("PROGRESS");
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!state.ok) return;
    formRef.current?.reset();
    // پاک‌کردن فیلدهای کنترل‌شده پس از ارسال موفق
    startTransition(() => {
      setImageUrl("");
      setBody("");
      setKind("PROGRESS");
    });
  }, [state]);

  return (
    <form
      ref={formRef}
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => formAction(data));
      }}
      className="card p-4 sm:p-5 space-y-3"
      aria-labelledby="composer-title"
    >
      <h2 id="composer-title" className="text-sm font-black text-brand-navy">از پیشرفت تیمت بنویس</h2>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="نوع پست">
        {BOARD_KINDS.map((k) => (
          <label key={k} className="cursor-pointer">
            <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} className="peer sr-only" />
            {/* کلاس با state، نه peer-checked: پوستهٔ تیره bg-brand-ice را با اولویت بالاتر بازنویسی می‌کند */}
            <span className={`inline-flex rounded-pill px-3 py-1.5 text-sm font-bold peer-focus-visible:ring-2 ring-brand-cyan ${kind === k ? "bg-brand-navy text-white" : "bg-brand-ice text-brand-navy"}`}>
              {BOARD_KIND_LABEL[k].emoji} {BOARD_KIND_LABEL[k].label}
            </span>
          </label>
        ))}
      </div>
      <div>
        <label className="label" htmlFor="board-body">متن</label>
        <textarea
          id="board-body"
          name="body"
          required
          rows={4}
          maxLength={BOARD_BODY_MAX}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="input w-full"
          placeholder="امروز چه ساختید؟ چه چیزی یاد گرفتید؟ از بقیه چه بازخوردی می‌خواهید؟"
        />
        <div className="mt-1 text-xs text-brand-slate fa-num text-left" dir="ltr">
          {body.length}/{BOARD_BODY_MAX}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {products.length > 0 && (
          <div>
            <label className="label" htmlFor="board-product">دربارهٔ کدام محصول؟</label>
            <select id="board-product" name="productId" className="input w-full" defaultValue="">
              <option value="">کلی (همهٔ تیم)</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="label" htmlFor="board-link">لینک (اختیاری)</label>
          <input id="board-link" name="linkUrl" type="url" dir="ltr" maxLength={400} placeholder="https://" className="input w-full" />
        </div>
      </div>
      <input type="hidden" name="imageUrl" value={imageUrl} />
      {imageUrl ? (
        <div className="flex items-center gap-3">
          <div className="relative size-20 rounded-xl overflow-hidden border border-brand-mist">
            <Image src={imageUrl} alt="" fill sizes="80px" className="object-cover" unoptimized={!isLocalUploadUrl(imageUrl)} />
          </div>
          <button type="button" className="btn-ghost !py-2 !px-4 text-sm" onClick={() => setImageUrl("")}>
            حذف تصویر
          </button>
        </div>
      ) : (
        <div>
          <span className="label">تصویر (اختیاری)</span>
          <ImageUploadField id="board-image" onUploaded={setImageUrl} disabled={pending} />
        </div>
      )}
      {state.error && <Alert kind="error">{state.error}</Alert>}
      {state.ok && !pending && <Alert kind="ok">پست منتشر شد.</Alert>}
      <button type="submit" disabled={pending} className="btn-primary w-full sm:w-auto">
        {pending ? "در حال انتشار…" : "انتشار در بورد"}
      </button>
    </form>
  );
}
