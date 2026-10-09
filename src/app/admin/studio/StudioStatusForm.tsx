"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Alert } from "@/components/ui";
import { setLiveStatusAction, type StudioActionState } from "./actions";

type AdminStatus = "REQUESTED" | "PUBLISHING" | "LIVE" | "REJECTED";

// برچسب‌ها همان LIVE_STATUS_LABEL در lib/studio هستند؛ آن ماژول سروری است و اینجا وارد نمی‌شود.
const OPTIONS: { value: AdminStatus; label: string }[] = [
  { value: "PUBLISHING", label: "در حال انتشار" },
  { value: "LIVE", label: "🚀 لایو شد" },
  { value: "REJECTED", label: "نیاز به اصلاح (بازگشت به تیم)" },
  { value: "REQUESTED", label: "بازگشت به «درخواست ثبت شده»" },
];

/** وضعیت پیشنهادی بعدی برای هر وضعیت فعلی */
const NEXT: Record<string, AdminStatus> = { REQUESTED: "PUBLISHING", PUBLISHING: "LIVE", LIVE: "LIVE", REJECTED: "REQUESTED" };

function SubmitButton() {
  const status = useFormStatus();
  return (
    <button type="submit" disabled={status.pending} className="btn-primary !py-2 !px-4 text-sm min-h-10">
      {status.pending ? "…" : "اعمال وضعیت"}
    </button>
  );
}

export function StudioStatusForm({
  productId,
  productName,
  current,
  liveUrl,
  adminNote,
}: {
  productId: string;
  productName: string;
  current: string;
  liveUrl: string;
  adminNote: string;
}) {
  const [state, formAction] = useActionState<StudioActionState, FormData>(setLiveStatusAction, {});
  const [status, setStatus] = useState<AdminStatus>(NEXT[current] ?? "PUBLISHING");
  const idp = `studio-${productId}`;

  return (
    <form
      action={formAction}
      className="space-y-3"
      onSubmit={(e) => {
        const label = OPTIONS.find((o) => o.value === status)?.label ?? status;
        if (!confirm(`وضعیت «${productName}» به «${label}» تغییر کند؟ تیم اعلان می‌گیرد.`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="productId" value={productId} />
      <div className="grid gap-3 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
        <div>
          <label className="label" htmlFor={`${idp}-status`}>وضعیت تازه</label>
          <select
            id={`${idp}-status`}
            name="status"
            value={status}
            onChange={(e) => setStatus(e.target.value as AdminStatus)}
            className="input !py-2"
          >
            {OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor={`${idp}-url`}>
            لینک محصول منتشرشده {status === "LIVE" ? "(الزامی)" : "(فقط برای لایو)"}
          </label>
          <input
            id={`${idp}-url`}
            name="liveUrl"
            type="url"
            dir="ltr"
            maxLength={400}
            defaultValue={liveUrl}
            required={status === "LIVE"}
            pattern="https?://.+"
            placeholder="https://"
            className="input !py-2"
          />
        </div>
      </div>
      <div>
        <label className="label" htmlFor={`${idp}-note`}>
          یادداشت برای تیم {status === "REJECTED" ? "(الزامی: چه چیزی باید اصلاح شود)" : "(اختیاری)"}
        </label>
        <textarea
          id={`${idp}-note`}
          name="note"
          rows={2}
          maxLength={600}
          defaultValue={adminNote}
          required={status === "REJECTED"}
          className="input w-full"
        />
      </div>
      <SubmitButton />
      {state.error && <Alert kind="error">{state.error}</Alert>}
      {state.ok && <span className="text-emerald-600 text-xs font-bold" role="status">وضعیت به‌روز شد</span>}
    </form>
  );
}
