"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { detectAndFlagCollusion } from "@/lib/admin";

export type FlagsActionState = { error?: string; ok?: boolean };

export async function runCollusionCheckAction(): Promise<FlagsActionState> {
  await requireAdmin();
  await detectAndFlagCollusion();
  revalidatePath("/admin/flags");
  return { ok: true };
}
