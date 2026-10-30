"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Alert } from "@/components/ui";
// فقط نوع؛ lib/studio به پایگاه‌داده وابسته است و نباید وارد باندل کلاینت شود (برچسب وضعیت از سرور می‌آید).
import type { LiveStatus } from "@/lib/studio";
import { requestGoLiveAction, cancelGoLiveAction, type StudioActionState } from "./actions";

const STATUS_CHIP: Record<Exclude<LiveStatus, "">, string> = {
  REQUESTED: "chip-gold",
  PUBLISHING: "chip-cyan",
  LIVE: "chip-ok",
  REJECTED: "chip-red",
};

function Submit({ label, pendingLabel, className }: { label: string; pendingLabel: string; className: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? pendingLabel : label}
    </button>
  );
}

/**
 * انتشار اختیاری محصول روی «بازار استودیو»: درخواست (لینک کد/بسته + شناسهٔ بسته + توضیح)، لغو، و نمایش وضعیت.
 * open: آیا الان درخواست ممکن است؛ closedNote: دلیل بسته بودن.
 */
export function StudioCard({
  trackId,
  status,
  statusLabel,
  sourceUrl,
  requestNote,
  liveUrl,
  adminNote,
  bazaarPackage,
  canManage,
  open,
  closedNote,
}: {
  trackId: string;
  status: LiveStatus;
  /** LIVE_STATUS_LABEL همین وضعیت (از سرور) */
  statusLabel: string;
  sourceUrl: string;
  requestNote: string;
  liveUrl: string;
  adminNote: string;
  /** شناسهٔ بسته روی بازار استودیو (package name)؛ آمار نصب و درآمد با این شناسه خوانده می‌شود */
  bazaarPackage: string;
  canManage: boolean;
  open: boolean;
  closedNote: string | null;
}) {
  const [reqState, requestAction] = useActionState<StudioActionState, FormData>(requestGoLiveAction, {});
  const [cancelState, cancelAction] = useActionState<StudioActionState, FormData>(async () => cancelGoLiveAction(trackId), {});
  const canRequest = canManage && open && (status === "" || status === "REJECTED");
  const canCancel = canManage && (status === "REQUESTED" || status === "REJECTED");

  return (
    <section className="card p-5 space-y-4 anim-rise" aria-labelledby="studio-title">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="studio-title" className="text-sm font-black text-brand-navy flex-1">
          🚀 انتشار روی بازار استودیو <span className="font-medium text-brand-slate">(اختیاری)</span>
        </h2>
        {status && <span className={STATUS_CHIP[status]}>{statusLabel}</span>}
      </div>
      <p className="text-xs text-brand-slate leading-6">
        اگر محصولت واقعاً قابل استفاده است، لینک کد یا بسته‌اش را بفرست تا برگزارکننده آن را روی بازار استودیو منتشر کند.
        محصول منتشرشده نشان «🚀 لایو» می‌گیرد و از زمان انتشار تا مهلت نهایی، نصب فعال، درآمد واقعی، امتیاز ستاره‌ای و تعداد نظرش در بخش بازارِ امتیاز حساب می‌شود.
      </p>

      {status === "LIVE" && liveUrl && (
        <a href={liveUrl} target="_blank" rel="noopener noreferrer" className="btn-cyan w-full justify-center" dir="ltr">
          مشاهدهٔ محصول لایو ↗
        </a>
      )}
      {status === "PUBLISHING" && <Alert kind="info">برگزارکننده در حال انتشار محصولت است.</Alert>}
      {status === "REQUESTED" && (
        <div className="rounded-2xl bg-brand-ice p-3 text-xs text-brand-navy space-y-1 break-words">
          <div>
            لینک ارسالی:{" "}
            <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4" dir="ltr">
              {sourceUrl}
            </a>
          </div>
          {requestNote && <div className="text-brand-slate whitespace-pre-line">{requestNote}</div>}
        </div>
      )}
      {status === "REJECTED" && (
        <Alert kind="error">
          درخواست نیاز به اصلاح دارد{adminNote ? `: ${adminNote}` : "."} اصلاح کن و دوباره بفرست.
        </Alert>
      )}
      {status !== "REJECTED" && adminNote && status !== "" && (
        <p className="text-xs text-brand-slate whitespace-pre-line break-words">یادداشت برگزارکننده: {adminNote}</p>
      )}

      {canRequest && (
        <form action={requestAction} className="space-y-3">
          <input type="hidden" name="trackId" value={trackId} />
          {reqState.error && <Alert kind="error">{reqState.error}</Alert>}
          <div>
            <label className="label" htmlFor="studioSourceUrl">لینک کد یا بستهٔ محصول</label>
            <input
              id="studioSourceUrl"
              name="sourceUrl"
              type="url"
              required
              maxLength={400}
              defaultValue={sourceUrl}
              className="input"
              placeholder="https://github.com/…"
              dir="ltr"
            />
          </div>
          <div>
            <label className="label" htmlFor="studioBazaarPackage">شناسهٔ بسته روی بازار (اختیاری)</label>
            <input
              id="studioBazaarPackage"
              name="bazaarPackage"
              maxLength={200}
              defaultValue={bazaarPackage}
              className="input"
              placeholder="com.example.app"
              dir="ltr"
            />
            <p className="mt-1 text-xs text-brand-slate">آمار بازار با همین شناسه به محصولت وصل می‌شود.</p>
          </div>
          <div>
            <label className="label" htmlFor="studioNote">توضیح برای برگزارکننده (اختیاری)</label>
            <textarea
              id="studioNote"
              name="note"
              maxLength={600}
              rows={3}
              defaultValue={requestNote}
              className="input"
              placeholder="نحوهٔ اجرا، نیازمندی‌ها، …"
            />
          </div>
          <Submit
            label={status === "REJECTED" ? "ارسال دوبارهٔ درخواست" : "درخواست انتشار"}
            pendingLabel="در حال ارسال…"
            className="btn-primary w-full justify-center"
          />
        </form>
      )}
      {reqState.ok && status === "REQUESTED" && <Alert kind="ok">درخواستت ثبت شد؛ نتیجه را اعلان می‌کنیم.</Alert>}

      {canCancel && (
        <form action={cancelAction} className="space-y-2">
          {cancelState.error && <Alert kind="error">{cancelState.error}</Alert>}
          <Submit label="لغو درخواست انتشار" pendingLabel="در حال لغو…" className="btn-ghost w-full justify-center" />
        </form>
      )}

      {!open && status === "" && closedNote && <p className="text-xs text-brand-slate">{closedNote}</p>}
    </section>
  );
}
