"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { PHASES, type Phase, getPhase } from "@/lib/phase";
import { transitionTo } from "@/lib/phase-transition";
import { settleGame, getSettledAt } from "@/lib/settlement";
import { setSetting, getSettingsMap, SETTING_LABELS } from "@/lib/admin";
import { parseGameSettings, saveSettings } from "@/lib/settings-schema";
import { lockedSettingChanges, withoutLockedKeys } from "@/lib/settings-lock";
import { audit } from "@/lib/audit";

export type AdminActionState = { error?: string; ok?: boolean };

const phaseSchema = z.object({
  phase: z.enum(PHASES as unknown as [Phase, ...Phase[]]),
  endsAt: z.string().optional(),
});

/** تغییر فاز بازی و زمان پایان آن */
export async function setPhaseAction(prevState: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const admin = await requireAdmin();

  const parsed = phaseSchema.safeParse({
    phase: formData.get("phase"),
    endsAt: formData.get("endsAt") ?? "",
  });
  if (!parsed.success) return { error: "فاز نامعتبر است" };

  const endsAt = parsed.data.endsAt ? new Date(parsed.data.endsAt) : null;
  if (parsed.data.endsAt && Number.isNaN(endsAt?.getTime())) return { error: "زمان پایان نامعتبر است" };
  // زمان پایانِ گذشته (مثلاً مقدار قدیمی فاز قبلی که در فرم مانده) باعث می‌شود زمان‌بند خودکار
  // بلافاصله فاز تازه را هم رد کند؛ یک دقیقه تلورانس برای تأخیر ارسال فرم. (CLOSED پیشروی ندارد.)
  if (endsAt && parsed.data.phase !== "CLOSED" && endsAt.getTime() < Date.now() - 60_000) {
    return { error: "زمان پایان گذشته است؛ یک زمان آینده انتخاب کن یا فیلد را خالی بگذار." };
  }

  const [before, settledAt] = await Promise.all([getPhase(), getSettledAt()]);
  // پس از تسویهٔ نهایی سودها پرداخت و امتیازها قفل شده‌اند؛ بازکردن دوبارهٔ بازار/حراج
  // باعث خرج سودهای واریزشده و ناهمخوانی نتایج ثبت‌شده با دفتر کل می‌شود.
  if (settledAt && parsed.data.phase !== "CLOSED") {
    return { error: "بازی تسویهٔ نهایی شده است؛ بازگشت به فازهای قبلی ممکن نیست." };
  }

  // transitionTo تنها نقطهٔ ورود تغییر فاز است: اعلان می‌فرستد و در CLOSED تسویه را اجرا می‌کند.
  const result = await transitionTo(parsed.data.phase, endsAt);
  await audit(admin.id, "phase.set", parsed.data.phase, {
    from: before.phase,
    to: parsed.data.phase,
    endsAt: endsAt ? endsAt.toISOString() : null,
    ...(result.settleFailed ? { settleFailed: true } : {}),
  });
  revalidatePath("/admin");
  revalidatePath("/admin/settlement");
  revalidatePath("/results");
  revalidatePath("/");
  if (result.settleFailed) {
    return { error: "فاز به «پایان بازی» رفت ولی تسویهٔ نهایی با خطا روبه‌رو شد؛ از صفحهٔ «تسویهٔ نهایی» دوباره اجرا کن." };
  }
  return { ok: true };
}

export type SettleActionState = AdminActionState & {
  dividendsPaid?: number;
  teams?: number;
  alreadySettled?: boolean;
};

/** اجرای دستی تسویهٔ نهایی توسط برگزارکننده (ایدمپوتنت). */
export async function settleNowAction(): Promise<SettleActionState> {
  const admin = await requireAdmin();
  try {
    const result = await settleGame();
    await audit(admin.id, "settlement.run", "", {
      alreadySettled: result.alreadySettled,
      dividendsPaid: result.dividendsPaid,
      teams: result.teams,
    });
    revalidatePath("/admin/settlement");
    revalidatePath("/results");
    revalidatePath("/wallet");
    revalidatePath("/leaderboard");
    return {
      ok: true,
      alreadySettled: result.alreadySettled,
      dividendsPaid: result.dividendsPaid,
      teams: result.teams,
    };
  } catch (e) {
    console.error("settleNowAction failed", e);
    return { error: "اجرای تسویه با خطا روبه‌رو شد" };
  }
}

/** ذخیرهٔ تنظیمات قابل‌تغییر بازی (اسکیمای مشترک در lib/settings-schema.ts) */
export async function updateSettingsAction(prevState: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const admin = await requireAdmin();

  const parsed = parseGameSettings(formData);
  if (!parsed.ok) return { error: parsed.error };

  const [before, { phase }] = await Promise.all([getSettingsMap(), getPhase()]);

  // قوانین اقتصادی باید پیش از شروع بازی ثابت و شفاف باشند: پس از REGISTRATION
  // هیچ کلید اقتصادی تغییر نمی‌کند و در صورت تلاش، هیچ چیزی ذخیره نمی‌شود.
  const lockedChanges = lockedSettingChanges(phase, before, parsed.data);
  if (lockedChanges.length > 0) {
    const labels = lockedChanges.map((key) => SETTING_LABELS[key]).join("، ");
    return { error: `مقادیر اقتصادی بازی پس از شروع بازی قفل‌اند و قابل تغییر نیستند: ${labels}` };
  }

  // کلیدهای قفل‌شده (که بدون تغییر ارسال شده‌اند) دوباره نوشته نمی‌شوند؛ فقط کلیدهای عملیاتی ذخیره می‌شوند.
  const after = await saveSettings(withoutLockedKeys(phase, parsed.data), setSetting);
  await audit(admin.id, "settings.update", "", { before, after });
  revalidatePath("/admin");
  return { ok: true };
}
