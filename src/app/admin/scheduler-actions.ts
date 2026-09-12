"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { setSetting, SCHEDULER_SETTING_KEYS, SCHEDULER_SETTING_KINDS } from "@/lib/admin";
import type { AdminActionState } from "./actions";

/**
 * ذخیرهٔ تنظیمات زمان‌بند خودکار (پیشروی خودکار فاز، حراج خودکار، ساعتِ هر فاز).
 * عمداً از `updateSettingsAction` در actions.ts جدا است: آن فایل مالک تیم دیگری است
 * و مجموعهٔ کلیدهایش را با zod ثابت اعتبارسنجی می‌کند؛ اینجا کلیدهای جدید را مستقل می‌سازیم.
 */
export async function updateSchedulerSettingsAction(
  _prevState: AdminActionState,
  formData: FormData
): Promise<AdminActionState> {
  await requireAdmin();

  const values: Record<string, string> = {};
  for (const key of SCHEDULER_SETTING_KEYS) {
    const kind = SCHEDULER_SETTING_KINDS[key];
    if (kind === "boolean") {
      // چک‌باکس خالی اصلاً در FormData نمی‌آید؛ غیاب آن یعنی «خاموش».
      values[key] = formData.get(key) === "1" ? "1" : "0";
      continue;
    }
    const raw = formData.get(key);
    if (typeof raw !== "string" || raw.trim() === "") return { error: "همهٔ مقادیر عددی را پر کن" };
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) return { error: "مقدار عددی نامعتبر است" };
    values[key] = String(Math.trunc(n));
  }

  await Promise.all(SCHEDULER_SETTING_KEYS.map((key) => setSetting(key, values[key])));
  revalidatePath("/admin");
  return { ok: true };
}
