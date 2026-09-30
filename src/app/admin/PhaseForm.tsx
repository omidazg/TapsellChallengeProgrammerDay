"use client";

import { useActionState, useSyncExternalStore } from "react";
import { useFormStatus } from "react-dom";
import { Alert } from "@/components/ui";
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

const noopSubscribe = () => () => {};

export function PhaseForm({ phase, endsAt, phases }: { phase: string; endsAt: string | null; phases: PhaseOption[] }) {
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

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        const selected = String(new FormData(e.currentTarget).get("phase") ?? "");
        const selectedIdx = phases.findIndex((p) => p.value === selected);
        const label = phases[selectedIdx]?.label ?? selected;
        let msg: string | null = null;
        if (selected === "CLOSED" && phase !== "CLOSED") {
          msg = `فاز به «${label}» برود؟ تسویهٔ نهایی بلافاصله اجرا می‌شود (پرداخت سودها و قفل امتیازها) و برگشت‌ناپذیر است.`;
        } else if (currentIdx >= 0 && selectedIdx >= 0 && selectedIdx < currentIdx) {
          msg = `فاز به عقب («${label}») برگردد؟ این کار برای همهٔ بازیکنان اعلان می‌شود.`;
        } else if (selected !== phase) {
          msg = `فاز به «${label}» تغییر کند؟ برای همهٔ بازیکنان اعلان می‌شود.`;
        }
        if (msg && !confirm(msg)) e.preventDefault();
      }}
      className="card p-4 sm:p-6 space-y-4 anim-rise"
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
          <select id="phase" name="phase" defaultValue={phase} className="input">
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
            key={hydrated ? "client" : "server"}
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
      <SubmitButton />
    </form>
  );
}
