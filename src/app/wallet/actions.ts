"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { chooseShieldTarget } from "@/lib/shield";

export type ShieldActionState = { error?: string; ok?: boolean };

/**
 * قدرت «سپر»: کاربر یکی از سرمایه‌گذاری‌هایش (یک تیم) را یک‌بار و برای همیشه بیمه می‌کند.
 * همهٔ بررسی‌ها (فاز، مالکیت قدرت، سرمایه‌گذاری مثبت، یک‌باره بودن) داخل `chooseShieldTarget` است.
 */
export async function chooseShieldAction(_prevState: ShieldActionState, formData: FormData): Promise<ShieldActionState> {
  const user = await requireUser();
  if (user.power !== "SHIELD") return { error: "این قدرت متعلق به تو نیست" };

  const teamId = String(formData.get("teamId") ?? "");
  const result = await chooseShieldTarget(user.id, teamId);
  if (!result.ok) return { error: result.error };

  revalidatePath("/wallet");
  return { ok: true };
}
