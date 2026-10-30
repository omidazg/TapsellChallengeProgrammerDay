"use client";

import { useActionState, useSyncExternalStore } from "react";
import { Alert } from "@/components/ui";
import { useConfirmSubmit } from "@/components/ConfirmDialog";
import { BAZAAR_SOURCES, BAZAAR_SOURCE_LABEL, MODULE_STATUSES, MODULE_STATUS_LABEL, type BazaarSource } from "@/lib/modules";
import { localInputToIso, toLocalInputValue } from "../datetime-local";
import {
  addExceptionAction,
  endContestAction,
  removeExceptionAction,
  setBazaarSourceAction,
  setDeadlineAction,
  setStatusAction,
  type ControlActionState,
} from "./actions";

const STATUS_CHIP: Record<string, string> = { open: "chip-ok", ro: "chip-gold", closed: "chip-red", hidden: "chip-navy" };

/** یک ردیف وضعیت: انتخاب وضعیت تازه و تیک اختیاری اعلان به همه (پیش‌فرض خاموش) */
export function StatusRow({ kind, id, label, current }: { kind: "module" | "track"; id: string; label: string; current: string }) {
  const [state, formAction, pending] = useActionState<ControlActionState, FormData>(setStatusAction, {});
  const htmlId = `${kind}-${id}`;
  return (
    <li className="rounded-2xl bg-brand-ice px-3 py-3 space-y-2">
      {/* key: پس از ذخیره، مقدار پیش‌فرض تازه و تیک خاموش نمایش داده شود */}
      <form key={current} action={formAction} className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="id" value={id} />
        <label htmlFor={htmlId} className="flex-1 min-w-48 text-sm font-bold text-brand-navy break-words">
          {label}
        </label>
        <span className={`${STATUS_CHIP[current] ?? "chip-navy"} shrink-0`}>
          {MODULE_STATUS_LABEL[current as keyof typeof MODULE_STATUS_LABEL] ?? current}
        </span>
        <select id={htmlId} name="status" defaultValue={current} className="input !py-2 !px-3 !text-sm !w-auto min-h-10">
          {MODULE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {MODULE_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-xs font-bold text-brand-slate cursor-pointer min-h-10">
          <input type="checkbox" name="notify" value="1" className="h-4 w-4 accent-brand-red" />
          به همه اطلاع بده
        </label>
        <button type="submit" disabled={pending} className="btn-ghost !py-2 !px-4 text-sm min-h-10">
          {pending ? "…" : "اعمال"}
        </button>
      </form>
      {state.error && <Alert kind="error">{state.error}</Alert>}
    </li>
  );
}

export function BazaarSourceForm({ current }: { current: BazaarSource }) {
  const [state, formAction, pending] = useActionState<ControlActionState, FormData>(setBazaarSourceAction, {});
  return (
    <form key={current} action={formAction} className="space-y-2">
      <label className="label" htmlFor="bazaar-source">منبع آمار بازار استودیو</label>
      <div className="flex flex-wrap items-center gap-2">
        <select id="bazaar-source" name="source" defaultValue={current} className="input !w-auto flex-1 min-w-48">
          {BAZAAR_SOURCES.map((s) => (
            <option key={s} value={s}>
              {BAZAAR_SOURCE_LABEL[s]}
            </option>
          ))}
        </select>
        <button type="submit" disabled={pending} className="btn-ghost min-h-10">
          {pending ? "…" : "ذخیره"}
        </button>
      </div>
      {state.error && <Alert kind="error">{state.error}</Alert>}
      {state.ok && <span className="text-emerald-600 text-xs font-bold" role="status">ذخیره شد</span>}
    </form>
  );
}

const noopSubscribe = () => () => {};

export function DeadlineForm({ endsAt, closed }: { endsAt: string | null; closed: boolean }) {
  // ورودی datetime-local به وقت مرورگر است؛ پیش از ارسال به ISO تبدیل می‌شود تا سرور (UTC) جابه‌جا تفسیرش نکند.
  const [state, formAction, pending] = useActionState<ControlActionState, FormData>(async (prev, formData) => {
    formData.set("endsAt", localInputToIso(String(formData.get("endsAt") ?? "")));
    return setDeadlineAction(prev, formData);
  }, {});
  // مقدار پیش‌فرض فقط پس از hydrate (با منطقهٔ زمانی مرورگر) ساخته می‌شود.
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  return (
    <form action={formAction} className="space-y-2">
      <label className="label" htmlFor="endsAt">ددلاین نهایی</label>
      <div className="flex flex-wrap items-center gap-2">
        <input
          key={`${hydrated ? "client" : "server"}|${endsAt ?? ""}`}
          id="endsAt"
          name="endsAt"
          type="datetime-local"
          defaultValue={hydrated && endsAt ? toLocalInputValue(new Date(endsAt)) : ""}
          disabled={closed}
          aria-describedby="endsAt-hint"
          className="input !w-auto flex-1 min-w-48"
        />
        <button type="submit" disabled={pending || closed} className="btn-ghost min-h-10">
          {pending ? "…" : "ذخیره"}
        </button>
      </div>
      <p id="endsAt-hint" className="text-xs text-brand-slate">
        به وقت مرورگرت؛ خالی یعنی بدون ددلاین. با رسیدن به این زمان مسابقه خودکار بسته می‌شود.
      </p>
      {state.error && <Alert kind="error">{state.error}</Alert>}
      {state.ok && <span className="text-emerald-600 text-xs font-bold" role="status">ذخیره شد</span>}
    </form>
  );
}

export function EndContestButton({ closed }: { closed: boolean }) {
  const [state, formAction, pending] = useActionState<ControlActionState, FormData>(async () => endContestAction(), {});
  const confirmSubmit = useConfirmSubmit();
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        confirmSubmit(e, {
          title: "مسابقه همین حالا تمام شود؟",
          body: "حراج زنده بسته می‌شود، آمار بازار برداشت می‌شود، تسویهٔ نهایی اجرا و همهٔ شرکت‌کننده‌ها خبردار می‌شوند. این کار برگشت‌ناپذیر است.",
          confirmLabel: "پایان مسابقه",
          destructive: true,
        });
      }}
      className="space-y-2"
    >
      <button type="submit" disabled={pending || closed} className="btn-primary disabled:opacity-50">
        {closed ? "مسابقه تمام شده است" : pending ? "در حال پایان‌دادن…" : "پایان مسابقه"}
      </button>
      {state.error && <Alert kind="error">{state.error}</Alert>}
      {state.ok && <Alert kind="ok">مسابقه تمام شد و تسویهٔ نهایی اجرا شد.</Alert>}
    </form>
  );
}

export type ExceptionTarget = { value: string; label: string };

export function AddExceptionForm({ targets, teams }: { targets: ExceptionTarget[]; teams: { id: string; name: string }[] }) {
  const [state, formAction, pending] = useActionState<ControlActionState, FormData>(addExceptionAction, {});
  return (
    <form action={formAction} className="space-y-2">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
        <div>
          <label className="label" htmlFor="exception-target">بخش یا محور</label>
          <select id="exception-target" name="moduleKey" required defaultValue="" className="input">
            <option value="" disabled>انتخاب کن…</option>
            {targets.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="exception-team">تیم</label>
          <select id="exception-team" name="teamId" required defaultValue="" className="input">
            <option value="" disabled>انتخاب کن…</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" disabled={pending} className="btn-ghost min-h-10">
          {pending ? "…" : "افزودن استثنا"}
        </button>
      </div>
      {state.error && <Alert kind="error">{state.error}</Alert>}
    </form>
  );
}

export function RemoveExceptionButton({ id, label }: { id: string; label: string }) {
  const [state, formAction, pending] = useActionState<ControlActionState, FormData>(removeExceptionAction, {});
  const confirmSubmit = useConfirmSubmit();
  return (
    <form action={formAction} onSubmit={(e) => confirmSubmit(e, { title: `استثنای «${label}» حذف شود؟`, confirmLabel: "حذف", destructive: true })}>
      <input type="hidden" name="id" value={id} />
      <button type="submit" disabled={pending} className="btn-ghost !py-2 !px-3 text-sm min-h-10 !text-brand-red">
        {pending ? "…" : "حذف"}
      </button>
      {state.error && <span className="ms-2 text-xs text-brand-red" role="alert">{state.error}</span>}
    </form>
  );
}
