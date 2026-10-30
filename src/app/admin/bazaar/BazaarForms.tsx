"use client";

import { startTransition, useActionState } from "react";
import { Alert } from "@/components/ui";
import { useConfirmSubmit } from "@/components/ConfirmDialog";
import { fa } from "@/lib/persian";
import {
  importBazaarAction,
  saveBazaarStatAction,
  setBazaarFlagAction,
  snapshotBazaarAction,
  type BazaarActionState,
} from "./actions";

export type BazaarFormRow = {
  productId: string;
  productName: string;
  activeInstalls: number;
  revenueToman: number;
  rating: number | null;
  commentCount: number;
  flagged: boolean;
  flagNote: string;
};

function NumberField({ id, name, label, value, max, step = 1 }: { id: string; name: string; label: string; value: number | string; max?: number; step?: number }) {
  return (
    <div>
      <label className="label" htmlFor={id}>{label}</label>
      <input id={id} name={name} type="number" inputMode="decimal" min={0} max={max} step={step} defaultValue={value} className="input !py-2 !px-3 w-full fa-num" />
    </div>
  );
}

/** ویرایش دستی چهار شاخص یک محصول */
export function BazaarStatForm({ row }: { row: BazaarFormRow }) {
  const [state, formAction, pending] = useActionState<BazaarActionState, FormData>(saveBazaarStatAction, {});
  const idp = `bazaar-${row.productId}`;
  return (
    <form
      // ارسال دستی: ری‌ست خودکار فرم (React 19) ورودی‌ها را پس از خطای اعتبارسنجی پاک می‌کرد.
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => formAction(data));
      }}
      className="space-y-2"
    >
      <input type="hidden" name="productId" value={row.productId} />
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
        <NumberField id={`${idp}-installs`} name="activeInstalls" label="نصب فعال" value={row.activeInstalls} />
        <NumberField id={`${idp}-revenue`} name="revenueToman" label="درآمد (تومان)" value={row.revenueToman} />
        <NumberField id={`${idp}-rating`} name="rating" label="امتیاز (۰ تا ۵)" value={row.rating ?? ""} max={5} step={0.1} />
        <NumberField id={`${idp}-comments`} name="commentCount" label="تعداد نظر" value={row.commentCount} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className="btn-ghost !py-2 !px-4 text-sm min-h-10">
          {pending ? "…" : "ذخیرهٔ آمار"}
        </button>
        {state.ok && !pending && <span className="text-emerald-600 text-xs font-bold" role="status">ذخیره شد</span>}
      </div>
      {state.error && <Alert kind="error">{state.error}</Alert>}
    </form>
  );
}

/** پرچم مشکوک با یادداشت؛ برای داوران هم نمایش داده می‌شود. */
export function BazaarFlagForm({ row }: { row: BazaarFormRow }) {
  const [state, formAction, pending] = useActionState<BazaarActionState, FormData>(setBazaarFlagAction, {});
  const confirmSubmit = useConfirmSubmit();
  const id = `bazaar-${row.productId}-note`;
  return (
    <form
      // ارسال دستی نمی‌شود چون تأیید لازم است؛ پس از ذخیره مقدار از سرور می‌آید.
      key={`${row.flagged}|${row.flagNote}`}
      action={formAction}
      onSubmit={(e) => {
        const raising = new FormData(e.currentTarget).get("flagged") === "1";
        confirmSubmit(e, raising ? `«${row.productName}» پرچم بخورد؟ آمارش تا رفع پرچم در امتیاز حساب نمی‌شود.` : `پرچم «${row.productName}» برداشته شود؟`);
      }}
      className="space-y-2"
    >
      <input type="hidden" name="productId" value={row.productId} />
      <input type="hidden" name="flagged" value={row.flagged ? "0" : "1"} />
      <div>
        <label className="label" htmlFor={id}>یادداشت پرچم (مثلاً نصب یا نظر مشکوک)</label>
        <input id={id} name="note" maxLength={400} defaultValue={row.flagNote} className="input !py-2 !px-3 w-full" />
      </div>
      <button type="submit" disabled={pending} className={`btn-ghost !py-2 !px-4 text-sm min-h-10 ${row.flagged ? "" : "!text-brand-red"}`}>
        {pending ? "…" : row.flagged ? "رفع پرچم" : "🚩 پرچم مشکوک"}
      </button>
      {state.error && <Alert kind="error">{state.error}</Alert>}
    </form>
  );
}

export function BazaarImportForm() {
  const [state, formAction, pending] = useActionState<BazaarActionState, FormData>(importBazaarAction, {});
  return (
    <form action={formAction} className="space-y-2">
      <label className="label" htmlFor="bazaar-file">فایل اکسل (xlsx)</label>
      <div className="flex flex-wrap items-center gap-2">
        <input
          id="bazaar-file"
          name="file"
          type="file"
          required
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="input !w-auto flex-1 min-w-48"
        />
        <button type="submit" disabled={pending} className="btn-ghost min-h-10">
          {pending ? "در حال خواندن…" : "ورود از اکسل"}
        </button>
      </div>
      <p className="text-xs text-brand-slate">
        سطر اول باید عنوان ستون‌ها باشد: شناسهٔ بسته (یا نشانی محصول)، نصب فعال، درآمد، امتیاز، تعداد نظر. فقط ستون امتیاز می‌تواند خالی باشد.
      </p>
      {state.error && <Alert kind="error">{state.error}</Alert>}
      {state.ok && (
        <Alert kind={state.skipped && state.skipped.length > 0 ? "info" : "ok"}>
          آمار {fa(state.saved ?? 0)} محصول ثبت شد.
          {state.skipped && state.skipped.length > 0 && <> این ردیف‌ها رد شدند: {state.skipped.join("، ")}</>}
        </Alert>
      )}
    </form>
  );
}

export function BazaarSnapshotButton() {
  const [state, formAction, pending] = useActionState<BazaarActionState, FormData>(async () => snapshotBazaarAction(), {});
  const confirmSubmit = useConfirmSubmit();
  return (
    <form action={formAction} onSubmit={(e) => confirmSubmit(e, "زمان برداشت نهایی روی آمارهایی که هنوز برداشت نشده‌اند ثبت شود؟")} className="space-y-2">
      <button type="submit" disabled={pending} className="btn-ghost min-h-10">
        {pending ? "…" : "برداشت نهایی آمار"}
      </button>
      {state.error && <Alert kind="error">{state.error}</Alert>}
      {state.ok && <span className="block text-emerald-600 text-xs font-bold" role="status">برداشت ثبت شد</span>}
    </form>
  );
}
