"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { PHASES, type Phase, getPhase } from "@/lib/phase";
import { transitionTo } from "@/lib/phase-transition";
import { settleGame } from "@/lib/settlement";
import { setSetting, getSettingsMap } from "@/lib/admin";
import { parseGameSettings, saveSettings } from "@/lib/settings-schema";
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

  const before = await getPhase();

  // transitionTo تنها نقطهٔ ورود تغییر فاز است: اعلان می‌فرستد و در CLOSED تسویه را اجرا می‌کند.
  await transitionTo(parsed.data.phase, endsAt);
  await audit(admin.id, "phase.set", parsed.data.phase, {
    from: before.phase,
    to: parsed.data.phase,
    endsAt: endsAt ? endsAt.toISOString() : null,
  });
  revalidatePath("/admin");
  revalidatePath("/admin/settlement");
  revalidatePath("/results");
  revalidatePath("/");
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

  const before = await getSettingsMap();
  const after = await saveSettings(parsed.data, setSetting);
  await audit(admin.id, "settings.update", "", { before, after });
  revalidatePath("/admin");
  return { ok: true };
}
