"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { moderateBoardPost } from "@/lib/board";
import { invalidate } from "@/lib/ttl-cache";

export async function moderatePostAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const field = formData.get("field");
  const value = formData.get("value") === "1";
  const change = field === "hidden" ? { hidden: value } : { featured: value };
  await moderateBoardPost(admin.id, String(formData.get("postId") ?? ""), change);
  revalidatePath("/admin/board");
  revalidatePath("/board");
  invalidate("feed:");
}
