"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";

export type JuryActionState = { error?: string; ok?: boolean };

const scoreSchema = z.object({
  productId: z.string().min(1),
  juryQuality: z.coerce.number().int().min(0).max(100),
  juryTeaser: z.coerce.number().int().min(0).max(100),
});

export async function saveJuryScoreAction(prevState: JuryActionState, formData: FormData): Promise<JuryActionState> {
  const admin = await requireAdmin();
  const parsed = scoreSchema.safeParse({
    productId: formData.get("productId"),
    juryQuality: formData.get("juryQuality"),
    juryTeaser: formData.get("juryTeaser"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "نمره باید بین ۰ تا ۱۰۰ باشد" };

  const before = await prisma.product.findUnique({
    where: { id: parsed.data.productId },
    select: { juryQuality: true, juryTeaser: true },
  });
  await prisma.product.update({
    where: { id: parsed.data.productId },
    data: { juryQuality: parsed.data.juryQuality, juryTeaser: parsed.data.juryTeaser },
  });
  await audit(admin.id, "jury.score", parsed.data.productId, {
    before,
    after: { juryQuality: parsed.data.juryQuality, juryTeaser: parsed.data.juryTeaser },
  });
  revalidatePath("/admin/jury");
  revalidatePath("/leaderboard");
  return { ok: true };
}
