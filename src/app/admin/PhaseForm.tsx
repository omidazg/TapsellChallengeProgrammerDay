"use client";

import { useActionState, useRef, useSyncExternalStore } from "react";
import { useFormStatus } from "react-dom";
import { Alert } from "@/components/ui";
import { fa, jdatetime } from "@/lib/persian";
import { setPhaseAction, type AdminActionState } from "./actions";
import { localInputToIso, toLocalInputValue } from "./datetime-local";

// هیچ چیزی از `@/lib/phase` وارد نمی‌شود: آن ماژول به prisma وابسته است
// و نباید در باندل کلاینت بیاید. گزینه‌ها از صفحهٔ سرور می‌رسند.
export type PhaseOption = { value: string; label: string };

function SubmitButton() {
  const status = useFormStatus();
  return (
    <button type="submit" disabled={status.pending} className="btn-primary w-full sm:w-auto">
      {status.pending ? "در حال اعمال…" : "اعمال"}
    </button>
  );
}

/** دکمهٔ یک‌کلیکی «رفتن به فاز بعد»: فیلدها را پر می‌کند و همان فرم (و همان confirm و همان setPhaseAction) را ارسال می‌کند. */
function NextPhaseButton({ label, hours, onGo }: { label: string; hours: number | null; onGo: () => void }) {
  const status = useFormStatus();
  return (
    <button type="button" onClick={onGo} disabled={status.pending} className="btn-navy w-full sm:w-auto">
      رفتن به «{label}»
      {hours != null && <span className="text-xs font-medium opacity-80">({fa(hours)} ساعت)</span>}
    </button>
  );
}

const noopSubscribe = () => () => {};

export function PhaseForm({
  phase,
  endsAt,
  phases,
  phaseHours = {},
}: {
  phase: string;
  endsAt: string | null;
  phases: PhaseOption[];
  /** مدت پیکربندی‌شدهٔ هر فاز (phase_hours_*) بر حسب ساعت؛ null یعنی بدون زمان پایان. */
  phaseHours?: Record<string, number | null>;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const phaseSelectRef = useRef<HTMLSelectElement>(null);
  const endsAtInputRef = useRef<HTMLInputElement>(null);
  // ورودی datetime-local به منطقهٔ زمانی مرورگر است؛ سرور (کانتینر UTC) آن را اشتباه تفسیر می‌کرد.
  // پس مقدار محلی همین‌جا در مرورگر به ISO تبدیل و بعد به سرور فرستاده می‌شود.
  const [state, formAction] = useActionState<AdminActionState, FormData>(async (prev, formData) => {
    formData.set("endsAt", localInputToIso(String(formData.get("endsAt") ?? "")));
    return setPhaseAction(prev, formData);
  }, {});
  // مقدار پیش‌فرض ورودی فقط پس از hydrate (با منطقهٔ زمانی مرورگر) ساخته می‌شود تا
  // رندر سرور (منطقهٔ زمانی سرور) مقدار غلط یا ناهمخوانی hydration نسازد.
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const localEndsAt = hydrated && endsAt ? toLocalInputValue(new Date(endsAt)) : "";

  const currentIdx = phases.findIndex((p) => p.value === phase);
  const next = currentIdx >= 0 && currentIdx < phases.length - 1 ? phases[currentIdx + 1] : null;
  const nextHours = next ? (phaseHours[next.value] ?? null) : null;

  // فاز بعد و زمان پایانِ «اکنون + مدت پیکربندی‌شدهٔ آن فاز» (یا خالی) در فرم نوشته می‌شود و سپس
  // فرم با requestSubmit ارسال می‌شود تا همان onSubmit (confirm) و همان اعتبارسنجی‌های سرور اجرا شوند.
  function goToNext() {
    const form = formRef.current;
    if (!next || !form || !phaseSelectRef.current || !endsAtInputRef.current) return;
    phaseSelectRef.current.value = next.value;
    endsAtInputRef.current.value = nextHours != null ? toLocalInputValue(new Date(Date.now() + nextHours * 3600_000)) : "";
    form.requestSubmit();
  }

  return (
    <form
      ref={formRef}
      id="phase-control"
      action={formAction}
      onSubmit={(e) => {
        const fd = new FormData(e.currentTarget);
        const selected = String(fd.get("phase") ?? "");
        const endsAtRaw = String(fd.get("endsAt") ?? "").trim();
        const endsAtDate = endsAtRaw ? new Date(endsAtRaw) : null;
        const endsAtNote =
          selected === "CLOSED"
            ? ""
            : endsAtDate && !Number.isNaN(endsAtDate.getTime())
              ? `\nزمان پایان: ${jdatetime(endsAtDate)}`
              : "\nبدون زمان پایان.";
        const selectedIdx = phases.findIndex((p) => p.value === selected);
        const label = phases[selectedIdx]?.label ?? selected;
        let msg: string | null = null;
        if (selected === "CLOSED" && phase !== "CLOSED") {
          msg = `فاز به «${label}» برود؟ تسویهٔ نهایی بلافاصله اجرا می‌شود (پرداخت سودها و قفل امتیازها) و برگشت‌ناپذیر است.`;
        } else if (currentIdx >= 0 && selectedIdx >= 0 && selectedIdx < currentIdx) {
          msg = `فاز به عقب («${label}») برگردد؟ این کار برای همهٔ بازیکنان اعلان می‌شود.${endsAtNote}`;
        } else if (selected !== phase) {
          msg = `فاز به «${label}» تغییر کند؟ برای همهٔ بازیکنان اعلان می‌شود.${endsAtNote}`;
        }
        if (msg && !confirm(msg)) e.preventDefault();
      }}
      className="card p-4 sm:p-6 space-y-4 anim-rise scroll-mt-32"
    >
      <h2 className="text-lg font-black text-brand-navy">کنترل فاز بازی</h2>
      {next && (
        <p className="text-xs text-brand-slate">
          با پایان زمان، فاز خودکار به «{next.label}» می‌رود (به‌شرط روشن بودن «پیشروی خودکار فاز» در تنظیمات زمان‌بند).
        </p>
      )}
      {state.error && <Alert kind="error">{state.error}</Alert>}
      {state.ok && <Alert kind="ok">فاز به‌روزرسانی شد.</Alert>}
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="label" htmlFor="phase">فاز</label>
          {/* key: پس از تغییر فاز روی سرور، مقدار پیش‌فرض تازه نمایش داده شود */}
          <select key={phase} ref={phaseSelectRef} id="phase" name="phase" defaultValue={phase} className="input">
            {phases.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="endsAt">زمان پایان</label>
          <input
            key={`${hydrated ? "client" : "server"}|${endsAt ?? ""}`}
            ref={endsAtInputRef}
            id="endsAt"
            name="endsAt"
            type="datetime-local"
            defaultValue={localEndsAt}
            aria-describedby="endsAt-hint"
            className="input"
          />
          <p id="endsAt-hint" className="mt-1 text-[11px] text-brand-slate">
            به وقت مرورگر شما؛ خالی یعنی بدون زمان پایان.
          </p>
        </div>
      </div>
      <div className="flex flex-col-reverse sm:flex-row sm:flex-wrap sm:items-center gap-3">
        <SubmitButton />
        {next && <NextPhaseButton label={next.label} hours={nextHours} onGo={goToNext} />}
      </div>
      {next && (
        <p className="text-[11px] text-brand-slate">
          دکمهٔ «رفتن به …» فاز بعد را با زمان پایان{" "}
          {nextHours != null ? `${fa(nextHours)} ساعت از همین حالا (طبق تنظیمات زمان‌بند)` : "خالی"} در فرم می‌نویسد و پس از تأیید اعمال می‌کند.
        </p>
      )}
    </form>
  );
}
