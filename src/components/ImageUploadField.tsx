"use client";

import { useEffect, useState } from "react";
import { fa } from "@/lib/persian";
import { uploadImageFile, uploadFileError, UPLOAD_ACCEPT } from "@/lib/product-utils";

type Status = "idle" | "uploading" | "error";

/**
 * ناحیهٔ آپلود تصویر (انتخاب فایل یا رهاکردن) با:
 * - بررسی فوری حجم (حداکثر ۵ مگابایت) و نوع فایل پیش از ارسال،
 * - پیش‌نمایش محلی (URL.createObjectURL که هنگام پاک‌سازی revoke می‌شود)،
 * - نوار پیشرفت آپلود (XMLHttpRequest، چون fetch پیشرفت آپلود ندارد).
 * پس از آپلود موفق، نشانی نهایی به `onUploaded` داده می‌شود.
 */
export function ImageUploadField({
  id,
  onUploaded,
  disabled = false,
}: {
  /** شناسهٔ ورودی فایل (برای label و پیوند چک‌لیست) */
  id: string;
  onUploaded: (url: string) => void;
  disabled?: boolean;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const [progress, setProgress] = useState(0);
  const [preview, setPreview] = useState<string | null>(null);

  // هر پیش‌نمایش قبلی (و پیش‌نمایش فعلی هنگام unmount) آزاد می‌شود
  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  const busy = status === "uploading";
  const inactive = disabled || busy;

  async function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (!file || inactive) return;
    const err = uploadFileError(file);
    if (err) {
      setPreview(null);
      setStatus("error");
      setMessage(err);
      return;
    }
    setPreview(URL.createObjectURL(file));
    setProgress(0);
    setStatus("uploading");
    setMessage("در حال آپلود تصویر…");
    try {
      const { url } = await uploadImageFile(file, setProgress);
      onUploaded(url);
      setPreview(null);
      setStatus("idle");
      setMessage("تصویر آپلود شد.");
    } catch (e) {
      setStatus("error");
      setMessage(e instanceof Error ? e.message : "آپلود با خطا مواجه شد");
    }
  }

  const percent = Math.round(progress * 100);

  return (
    <div
      className="rounded-2xl border-2 border-dashed border-brand-mist p-3 text-center transition hover:border-brand-cyan"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        handleFiles(e.dataTransfer.files);
      }}
    >
      <label htmlFor={id} className={`btn-cyan inline-block ${inactive ? "pointer-events-none opacity-50" : "cursor-pointer"}`}>
        {busy ? "در حال آپلود…" : "آپلود تصویر از رایانه"}
      </label>
      <input
        id={id}
        type="file"
        accept={UPLOAD_ACCEPT}
        className="sr-only"
        disabled={inactive}
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <p className="mt-1 text-xs text-brand-slate">یا فایل را همین‌جا رها کن (حداکثر {fa(5)} مگابایت)</p>

      {preview && (
        <div className="mt-3 flex items-center gap-3 text-start">
          {/* پیش‌نمایش محلی blob: — next/image برای نشانی‌های blob مناسب نیست */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt="پیش‌نمایش تصویر در حال آپلود"
            className={`size-16 shrink-0 rounded-xl border object-cover ${status === "error" ? "border-brand-red opacity-60" : "border-brand-mist"}`}
          />
          {busy && (
            <div className="flex-1 min-w-0">
              <div
                role="progressbar"
                aria-label="پیشرفت آپلود"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
                className="h-2 w-full overflow-hidden rounded-full bg-brand-mist"
              >
                <div className="h-full rounded-full bg-brand-cyan-dark transition-[width] duration-200" style={{ width: `${percent}%` }} />
              </div>
              <div className="mt-1 text-xs text-brand-slate fa-num">
                {percent < 100 ? `${fa(percent)}٪` : "در حال پردازش تصویر…"}
              </div>
            </div>
          )}
        </div>
      )}

      <p role="status" aria-live="polite" className={`mt-1 text-xs ${status === "error" ? "text-brand-red" : "text-brand-slate"}`}>
        {message}
      </p>
    </div>
  );
}
