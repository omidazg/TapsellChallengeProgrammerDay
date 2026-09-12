"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { setPhase, PHASES, type Phase } from "@/lib/phase";
import { setSetting, SETTING_KEYS } from "@/lib/admin";

export type AdminActionState = { error?: string; ok?: boolean };

const phaseSchema = z.object({
  phase: z.enum(PHASES as unknown as [Phase, ...Phase[]]),
  endsAt: z.string().optional(),
});

/** تغییر فاز بازی و زمان پایان آن */
export async function setPhaseAction(prevState: AdminActionState, formData: FormData): Promise<AdminActionState> {
  await requireAdmin();

  const parsed = phaseSchema.safeParse({
    phase: formData.get("phase"),
    endsAt: formData.get("endsAt") ?? "",
  });
  if (!parsed.success) return { error: "فاز نامعتبر است" };

  const endsAt = parsed.data.endsAt ? new Date(parsed.data.endsAt) : null;
  if (parsed.data.endsAt && Number.isNaN(endsAt?.getTime())) return { error: "زمان پایان نامعتبر است" };

  await setPhase(parsed.data.phase, endsAt);
  revalidatePath("/admin");
  revalidatePath("/");
  return { ok: true };
}

const settingsSchema = z.object({
  seed_wallet: z.coerce.number().int().min(0),
  buy_wallet: z.coerce.number().int().min(0),
  max_per_target: z.coerce.number().int().min(1),
  penalty_per_coin: z.coerce.number().min(0),
  bid_increment: z.coerce.number().int().min(1),
  auction_duration_sec: z.coerce.number().int().min(10),
  market_starts_at: z
    .string()
    .optional()
    .default("")
    .refine((v) => v === "" || !Number.isNaN(new Date(v).getTime()), "زمان شروع روز بازار نامعتبر است"),
});

/** ذخیرهٔ تنظیمات قابل‌تغییر بازی */
export async function updateSettingsAction(prevState: AdminActionState, formData: FormData): Promise<AdminActionState> {
  await requireAdmin();

  const raw: Record<string, string> = {};
  for (const key of SETTING_KEYS) {
    const value = formData.get(key);
    // فیلد خالی/غایب نباید بی‌سروصدا صفر شود
    if (typeof value !== "string" || (value.trim() === "" && key !== "market_starts_at")) {
      return { error: "همهٔ مقادیر عددی را پر کن" };
    }
    raw[key] = value.trim();
  }
  const parsed = settingsSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "ورودی نامعتبر است" };

  await Promise.all(
    SETTING_KEYS.map((key) => setSetting(key, String(parsed.data[key as keyof typeof parsed.data])))
  );
  revalidatePath("/admin");
  return { ok: true };
}
