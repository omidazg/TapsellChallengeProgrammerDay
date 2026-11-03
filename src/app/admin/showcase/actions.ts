"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { reviewShowcase, setShowcaseFeatured } from "@/lib/showcase";

function revalidateShowcase() {
  revalidatePath("/admin/showcase");
  revalidatePath("/showcase");
}

export async function reviewShowcaseAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const decision = formData.get("decision") === "APPROVED" ? "APPROVED" : "REJECTED";
  const note = String(formData.get("note") ?? "").trim().slice(0, 500);
  await reviewShowcase(admin.id, String(formData.get("productId") ?? ""), decision, note);
  revalidateShowcase();
}

export async function featureShowcaseAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  await setShowcaseFeatured(admin.id, String(formData.get("productId") ?? ""), formData.get("featured") === "1");
  revalidateShowcase();
}
