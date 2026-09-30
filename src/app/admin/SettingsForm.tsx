"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Alert } from "@/components/ui";
import { updateSettingsAction, type AdminActionState } from "./actions";

// هیچ چیزی از `@/lib/admin` وارد نمی‌شود: آن ماژول به prisma وابسته است
// و نباید در باندل کلاینت بیاید. فیلدها از صفحهٔ سرور می‌رسند.
// `locked`: فیلد اقتصادی پس از شروع بازی قفل است و فقط‌خواندنی نمایش داده می‌شود.
export type SettingField = { key: string; label: string; value: string; kind: "number" | "datetime" | "boolean"; locked?: boolean };

function SubmitButton() {
  const status = useFormStatus();
  return (
    <button type="submit" disabled={status.pending} className="btn-primary w-full sm:w-auto">
      {status.pending ? "در حال ذخیره…" : "ذخیرهٔ تنظیمات"}
    </button>
  );
}

type SettingsAction = (prevState: AdminActionState, formData: FormData) => Promise<AdminActionState>;

export function SettingsForm({
  fields,
  action,
  title = "تنظیمات بازی",
}: {
  fields: SettingField[];
  action?: SettingsAction;
  title?: string;
}) {
  const [state, formAction] = useActionState<AdminActionState, FormData>(action ?? updateSettingsAction, {});
  const hasLocked = fields.some((f) => f.locked);
  // فیلدهای قفل readOnly‌اند نه disabled: ورودی disabled در FormData ارسال نمی‌شود
  // و parseGameSettings فیلد عددیِ غایب را رد می‌کند. سرور هم مقدار بدون تغییر را می‌پذیرد.
  const lockedCls = "!bg-brand-ice !text-brand-slate cursor-not-allowed";

  return (
    <form action={formAction} className="card p-4 sm:p-6 space-y-4 anim-rise">
      <h2 className="text-lg font-black text-brand-navy">{title}</h2>
      {state.error && <Alert kind="error">{state.error}</Alert>}
      {state.ok && <Alert kind="ok">تنظیمات ذخیره شد.</Alert>}
      {hasLocked && (
        <Alert kind="info">
          🔒 بازی شروع شده است؛ مقادیر اقتصادی (کیف‌ها، سقف، جریمه و گام حراج) قفل‌اند تا قوانین برای همه ثابت و شفاف بماند.
          فقط تنظیمات زمان‌بندی قابل تغییرند.
        </Alert>
      )}
      <div className="grid sm:grid-cols-2 gap-4">
        {fields.map((f) => (
          <div key={f.key}>
            {f.kind === "boolean" ? (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  id={f.key}
                  name={f.key}
                  type="checkbox"
                  value="1"
                  defaultChecked={f.value === "1"}
                  disabled={f.locked}
                  className="h-4 w-4 accent-brand-red"
                />
                {/* چک‌باکس readOnly ندارد؛ مقدار فعلیِ فیلد قفل با ورودی مخفی ارسال می‌شود */}
                {f.locked && f.value === "1" && <input type="hidden" name={f.key} value="1" />}
                <span className="label !mb-0">
                  {f.label}
                  {f.locked && " 🔒"}
                </span>
              </label>
            ) : (
              <>
                <label className="label" htmlFor={f.key}>
                  {f.label}
                  {f.locked && " 🔒"}
                </label>
                {f.kind === "datetime" ? (
                  <input
                    id={f.key}
                    name={f.key}
                    type="datetime-local"
                    defaultValue={f.value}
                    readOnly={f.locked}
                    aria-readonly={f.locked || undefined}
                    className={`input ${f.locked ? lockedCls : ""}`}
                  />
                ) : (
                  <input
                    id={f.key}
                    name={f.key}
                    type="number"
                    step="any"
                    required
                    defaultValue={f.value}
                    readOnly={f.locked}
                    aria-readonly={f.locked || undefined}
                    title={f.locked ? "پس از شروع بازی قفل است" : undefined}
                    className={`input ${f.locked ? lockedCls : ""}`}
                  />
                )}
              </>
            )}
          </div>
        ))}
      </div>
      <SubmitButton />
    </form>
  );
}
