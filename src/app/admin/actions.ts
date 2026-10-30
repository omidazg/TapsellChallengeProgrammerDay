"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { settleGame, resettleGame, getSettledAt } from "@/lib/settlement";
import { areEconomySettingsLocked, setSetting, getSettingsMap, SETTING_LABELS } from "@/lib/admin";
import { parseGameSettings, saveSettings } from "@/lib/settings-schema";
import { lockedSettingChanges, withoutLockedKeys } from "@/lib/settings-lock";
import { audit } from "@/lib/audit";

export type AdminActionState = { error?: string; ok?: boolean };

export type SettleActionState = AdminActionState & {
  teams?: number;
  alreadySettled?: boolean;
  /** زمان تسویه (ISO) */
  settledAt?: string;
};

/**
 * اجرای دستی تسویهٔ نهایی توسط برگزارکننده (ایدمپوتنت): امتیازها در TeamScore ثبت می‌شوند.
 * اگر پیش از پایان مسابقه اجرا شود، تسویه زودهنگام است و با پایان مسابقه (دستی یا خودکار)
 * با همهٔ فعالیت‌ها تا آن لحظه بازمحاسبه و جایگزین می‌شود.
 */
export async function settleNowAction(): Promise<SettleActionState> {
  const admin = await requireAdmin();
  try {
    const result = await settleGame();
    await audit(admin.id, "settlement.run", "", {
      alreadySettled: result.alreadySettled,
      teams: result.teams,
      settledAt: result.settledAt.toISOString(),
    });
    revalidatePath("/admin/settlement");
    revalidatePath("/results");
    revalidatePath("/leaderboard");
    revalidatePath("/hall");
    return {
      ok: true,
      alreadySettled: result.alreadySettled,
      teams: result.teams,
      settledAt: result.settledAt.toISOString(),
    };
  } catch (e) {
    console.error("settleNowAction failed", e);
    return { error: "اجرای تسویه با خطا روبه‌رو شد" };
  }
}

/** بازتسویه پس از تسویه: نمره‌های دیرهنگام داوران و کسرهای تقلب تازه در نتیجهٔ ثبت‌شده اعمال می‌شوند. */
export async function resettleAction(): Promise<SettleActionState> {
  const admin = await requireAdmin();
  if (!(await getSettledAt())) return { error: "هنوز تسویه‌ای انجام نشده است" };
  try {
    const result = await resettleGame();
    await audit(admin.id, "settlement.rerun", "", { teams: result.teams, settledAt: result.settledAt.toISOString() });
    revalidatePath("/admin/settlement");
    revalidatePath("/results");
    revalidatePath("/leaderboard");
    revalidatePath("/hall");
    return { ok: true, alreadySettled: false, teams: result.teams, settledAt: result.settledAt.toISOString() };
  } catch (e) {
    console.error("resettleAction failed", e);
    return { error: "بازتسویه با خطا روبه‌رو شد" };
  }
}

/** ذخیرهٔ تنظیمات قابل‌تغییر بازی (اسکیمای مشترک در lib/settings-schema.ts) */
export async function updateSettingsAction(prevState: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const admin = await requireAdmin();

  const parsed = parseGameSettings(formData);
  if (!parsed.ok) return { error: parsed.error };

  const [before, locked] = await Promise.all([getSettingsMap(), areEconomySettingsLocked()]);

  // قوانین اقتصادی باید ثابت و شفاف بمانند: از اولین خرج سکه هیچ کلید اقتصادی تغییر نمی‌کند
  // و در صورت تلاش، هیچ چیزی ذخیره نمی‌شود.
  const lockedChanges = lockedSettingChanges(locked, before, parsed.data);
  if (lockedChanges.length > 0) {
    const labels = lockedChanges.map((key) => SETTING_LABELS[key]).join("، ");
    return { error: `مقادیر اقتصادی بازی پس از اولین خرج سکه قفل‌اند و قابل تغییر نیستند: ${labels}` };
  }

  // کلیدهای قفل‌شده (که بدون تغییر ارسال شده‌اند) دوباره نوشته نمی‌شوند؛ فقط کلیدهای عملیاتی ذخیره می‌شوند.
  const after = await saveSettings(withoutLockedKeys(locked, parsed.data), setSetting);
  await audit(admin.id, "settings.update", "", { before, after });
  revalidatePath("/admin");
  return { ok: true };
}
