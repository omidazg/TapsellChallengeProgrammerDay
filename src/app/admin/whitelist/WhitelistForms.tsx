"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui";
import { DEPARTMENTS } from "@/app/register/departments";
import {
  setWhitelistEnabledAction,
  addEntryAction,
  bulkAddAction,
  updateEntryAction,
  deleteEntryAction,
  approveRequestAction,
  rejectRequestAction,
  type WhitelistActionState,
} from "./actions";

export type EntryData = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  position: string;
  unit: string;
  note: string;
  hasAccount: boolean;
};

export type RequestData = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  position: string;
  unit: string;
  status: string;
  statusLabel: string;
  createdAt: string;
};

/** پیشنهادهای واحد سازمانی؛ یک‌بار در صفحه رندر می‌شود و همهٔ فرم‌ها از آن استفاده می‌کنند */
export function UnitOptions() {
  return (
    <datalist id="wl-unit-options">
      {DEPARTMENTS.map((d) => (
        <option key={d} value={d} />
      ))}
    </datalist>
  );
}

function EntryFields({ idPrefix, values }: { idPrefix: string; values?: Partial<EntryData> }) {
  const f = (name: keyof EntryData) => `${idPrefix}-${name}`;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <div className="sm:col-span-2 lg:col-span-1">
        <label className="label" htmlFor={f("email")}>ایمیل</label>
        <input id={f("email")} name="email" type="email" dir="ltr" required maxLength={120} className="input" defaultValue={values?.email} />
      </div>
      <div>
        <label className="label" htmlFor={f("firstName")}>نام</label>
        <input id={f("firstName")} name="firstName" maxLength={40} className="input" defaultValue={values?.firstName} />
      </div>
      <div>
        <label className="label" htmlFor={f("lastName")}>نام خانوادگی</label>
        <input id={f("lastName")} name="lastName" maxLength={40} className="input" defaultValue={values?.lastName} />
      </div>
      <div>
        <label className="label" htmlFor={f("position")}>سمت</label>
        <input id={f("position")} name="position" maxLength={60} className="input" defaultValue={values?.position} />
      </div>
      <div>
        <label className="label" htmlFor={f("unit")}>واحد سازمانی</label>
        <input id={f("unit")} name="unit" list="wl-unit-options" maxLength={60} className="input" defaultValue={values?.unit} />
      </div>
      <div>
        <label className="label" htmlFor={f("note")}>یادداشت</label>
        <input id={f("note")} name="note" maxLength={200} className="input" defaultValue={values?.note} />
      </div>
    </div>
  );
}

export function WhitelistToggle({ enabled }: { enabled: boolean }) {
  const [state, action, pending] = useActionState<WhitelistActionState, FormData>(setWhitelistEnabledAction, {});
  return (
    <form
      action={action}
      className="card p-4 sm:p-6 flex flex-wrap items-center gap-3 anim-rise"
      onSubmit={(e) => {
        const msg = enabled
          ? "لیست سفید خاموش شود؟ هر کسی (طبق قاعدهٔ دامنهٔ ایمیل) می‌تواند ثبت‌نام کند."
          : "لیست سفید روشن شود؟ فقط ایمیل‌های این فهرست می‌توانند ثبت‌نام کنند.";
        if (!confirm(msg)) e.preventDefault();
      }}
    >
      <input type="hidden" name="enabled" value={enabled ? "0" : "1"} />
      <div className="flex-1 min-w-[200px]">
        <div className="font-black text-brand-navy flex items-center gap-2">
          لیست سفید:
          {enabled ? <span className="chip chip-navy">روشن</span> : <span className="chip chip-red">خاموش</span>}
        </div>
        <p className="text-xs text-brand-slate mt-1">
          {enabled
            ? "فقط ایمیل‌های این فهرست می‌توانند حساب بسازند؛ بقیه باید درخواست دسترسی بدهند."
            : "ثبت‌نام برای همه (طبق ALLOWED_EMAIL_DOMAINS) باز است."}{" "}
          کاربرانی که از قبل حساب دارند در هر حال وارد می‌شوند.
        </p>
      </div>
      <button type="submit" disabled={pending} className={enabled ? "btn-ghost" : "btn-primary"}>
        {enabled ? "خاموش کن" : "روشن کن"}
      </button>
      {state.error && <Alert kind="error">{state.error}</Alert>}
    </form>
  );
}

export function AddEntryForm() {
  const [state, action, pending] = useActionState<WhitelistActionState, FormData>(addEntryAction, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={action} className="card p-4 sm:p-6 space-y-3 anim-rise">
      <h3 className="font-black text-brand-navy">افزودن یک نفر</h3>
      <EntryFields idPrefix="wl-new" />
      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "در حال افزودن…" : "افزودن به لیست سفید"}
      </button>
      {state.error && <Alert kind="error">{state.error}</Alert>}
      {state.message && <Alert kind="ok">{state.message}</Alert>}
    </form>
  );
}

export function BulkAddForm() {
  const [state, action, pending] = useActionState<WhitelistActionState, FormData>(bulkAddAction, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={action} className="card p-4 sm:p-6 space-y-3 anim-rise">
      <h3 className="font-black text-brand-navy">افزودن گروهی</h3>
      <p className="text-xs text-brand-slate">
        هر خط یک نفر: فقط ایمیل، یا «ایمیل، نام، نام خانوادگی، سمت، واحد» (با ویرگول یا تب؛ می‌شود مستقیم از اکسل کپی کرد).
      </p>
      <label htmlFor="wl-bulk" className="label">فهرست ایمیل‌ها</label>
      <textarea
        id="wl-bulk"
        name="lines"
        rows={5}
        dir="ltr"
        className="input w-full font-mono text-xs"
        placeholder={"ali@tapsell.ir\nsara@tapsell.ir, سارا, احمدی, طراح محصول, محصول"}
      />
      <button type="submit" disabled={pending} className="btn-cyan">
        {pending ? "در حال افزودن…" : "افزودن همه"}
      </button>
      {state.error && <Alert kind="error">{state.error}</Alert>}
      {state.message && <Alert kind="ok">{state.message}</Alert>}
    </form>
  );
}

export function EntryRow({ entry }: { entry: EntryData }) {
  const [editing, setEditing] = useState(false);
  const [updateState, updateAction, updating] = useActionState<WhitelistActionState, FormData>(async (prev, formData) => {
    const res = await updateEntryAction(prev, formData);
    if (res.ok) setEditing(false);
    return res;
  }, {});
  const [deleteState, deleteAction] = useActionState<WhitelistActionState, FormData>(deleteEntryAction, {});

  const fullName = `${entry.firstName} ${entry.lastName}`.trim();

  if (editing) {
    return (
      <form action={updateAction} className="card p-4 sm:p-5 space-y-3">
        <input type="hidden" name="id" value={entry.id} />
        <EntryFields idPrefix={`wl-${entry.id}`} values={entry} />
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={updating} className="btn-primary !py-1 !px-4 text-sm">
            {updating ? "در حال ذخیره…" : "ذخیره"}
          </button>
          <button type="button" onClick={() => setEditing(false)} className="btn-ghost !py-1 !px-4 text-sm">
            انصراف
          </button>
        </div>
        {updateState.error && <Alert kind="error">{updateState.error}</Alert>}
      </form>
    );
  }

  return (
    <div className="card p-4 sm:p-5 flex flex-wrap items-center gap-3">
      <div className="min-w-[180px] flex-1 break-words">
        <div className="font-bold text-brand-navy flex flex-wrap items-center gap-2">
          {fullName || <span className="text-brand-slate font-normal">بدون نام</span>}
          {entry.hasAccount ? (
            <span className="chip chip-navy !py-0.5 !px-2 text-[10px]">حساب ساخته</span>
          ) : (
            <span className="chip !py-0.5 !px-2 text-[10px]">هنوز ثبت‌نام نکرده</span>
          )}
        </div>
        <div className="text-xs text-brand-slate break-words" dir="ltr">{entry.email}</div>
        {(entry.position || entry.unit) && (
          <div className="text-xs text-brand-slate">{[entry.position, entry.unit].filter(Boolean).join(" · ")}</div>
        )}
        {entry.note && <div className="text-xs text-brand-slate">{entry.note}</div>}
      </div>
      <button type="button" onClick={() => setEditing(true)} className="btn-ghost !py-1 !px-3 text-xs" aria-label={`ویرایش ${entry.email}`}>
        ویرایش
      </button>
      <form
        action={deleteAction}
        onSubmit={(e) => {
          const extra = entry.hasAccount ? "\nحساب موجود این فرد حذف نمی‌شود و همچنان می‌تواند وارد شود." : "";
          if (!confirm(`${entry.email} از لیست سفید حذف شود؟${extra}`)) e.preventDefault();
        }}
      >
        <input type="hidden" name="id" value={entry.id} />
        <button type="submit" className="chip chip-red" aria-label={`حذف ${entry.email} از لیست سفید`}>
          حذف
        </button>
      </form>
      {deleteState.error && <Alert kind="error">{deleteState.error}</Alert>}
    </div>
  );
}

export function RequestRow({ request }: { request: RequestData }) {
  const [approveState, approveAction, approving] = useActionState<WhitelistActionState, FormData>(approveRequestAction, {});
  const [rejectState, rejectAction, rejecting] = useActionState<WhitelistActionState, FormData>(rejectRequestAction, {});
  const name = `${request.firstName} ${request.lastName}`;
  const statusChip = request.status === "REJECTED" ? "chip-red" : request.status === "APPROVED" ? "chip-navy" : "";

  return (
    <div className="card p-4 sm:p-5 flex flex-wrap items-center gap-3">
      <div className="min-w-[180px] flex-1 break-words">
        <div className="font-bold text-brand-navy flex flex-wrap items-center gap-2">
          {name}
          <span className={`chip ${statusChip} !py-0.5 !px-2 text-[10px]`}>{request.statusLabel}</span>
        </div>
        <div className="text-xs text-brand-slate break-words" dir="ltr">{request.email}</div>
        <div className="text-xs text-brand-slate">سمت: {request.position} · واحد سازمانی: {request.unit}</div>
        <div className="text-[11px] text-brand-slate">{request.createdAt}</div>
      </div>
      {request.status !== "APPROVED" && (
        <form action={approveAction}>
          <input type="hidden" name="id" value={request.id} />
          <button type="submit" disabled={approving} className="btn-primary !py-1 !px-4 text-sm" aria-label={`تأیید درخواست ${name}`}>
            تأیید
          </button>
        </form>
      )}
      {request.status === "PENDING" && (
        <form
          action={rejectAction}
          onSubmit={(e) => {
            if (!confirm(`درخواست ${name} رد شود؟`)) e.preventDefault();
          }}
        >
          <input type="hidden" name="id" value={request.id} />
          <button type="submit" disabled={rejecting} className="btn-ghost !py-1 !px-4 text-sm" aria-label={`رد درخواست ${name}`}>
            رد
          </button>
        </form>
      )}
      {approveState.error && <Alert kind="error">{approveState.error}</Alert>}
      {rejectState.error && <Alert kind="error">{rejectState.error}</Alert>}
    </div>
  );
}
