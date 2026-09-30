"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { detectAndFlagCollusion } from "@/lib/admin";
import { audit } from "@/lib/audit";

export type FlagsActionState = { error?: string; ok?: boolean; flagCount?: number };

export async function runCollusionCheckAction(): Promise<FlagsActionState> {
  const admin = await requireAdmin();
  let flagCount: number;
  try {
    flagCount = (await detectAndFlagCollusion()).length;
  } catch (e) {
    console.error("runCollusionCheckAction failed", e);
    return { error: "بررسی با خطا روبه‌رو شد؛ دوباره تلاش کن" };
  }
  await audit(admin.id, "flags.run_check", "", { flagCount });
  revalidatePath("/admin/flags");
  return { ok: true, flagCount };
}
