"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { setSetting, getSchedulerSettingsMap } from "@/lib/admin";
import { parseSchedulerSettings, saveSettings } from "@/lib/settings-schema";
import { audit } from "@/lib/audit";
import type { AdminActionState } from "./actions";

/**
 * ذخیرهٔ تنظیمات زمان‌بند خودکار (پیشروی خودکار فاز، حراج خودکار، ساعتِ هر فاز).
 * عمداً از `updateSettingsAction` در actions.ts جدا است: آن فایل مالک تیم دیگری است.
 * اعتبارسنجی و ذخیره از همان پایپ‌لاین مشترک `lib/settings-schema.ts` استفاده می‌کند
 * تا رفتار با فرم تنظیمات بازی یکسان بماند؛ فقط زیرمجموعهٔ کلیدها فرق دارد.
 */
export async function updateSchedulerSettingsAction(
  _prevState: AdminActionState,
  formData: FormData
): Promise<AdminActionState> {
  const admin = await requireAdmin();

  const parsed = parseSchedulerSettings(formData);
  if (!parsed.ok) return { error: parsed.error };

  const before = await getSchedulerSettingsMap();
  const after = await saveSettings(parsed.data, setSetting);
  await audit(admin.id, "scheduler.update", "", { before, after });
  revalidatePath("/admin");
  return { ok: true };
}
