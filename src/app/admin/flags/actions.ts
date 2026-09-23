"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { detectAndFlagCollusion } from "@/lib/admin";
import { audit } from "@/lib/audit";

export type FlagsActionState = { error?: string; ok?: boolean };

export async function runCollusionCheckAction(): Promise<FlagsActionState> {
  const admin = await requireAdmin();
  const flags = await detectAndFlagCollusion();
  await audit(admin.id, "flags.run_check", "", { flagCount: flags.length });
  revalidatePath("/admin/flags");
  return { ok: true };
}
