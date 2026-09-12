"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";

const FIELD_ERRORS: Record<string, string> = {
  nickname: "نام مستعار باید بین ۲ تا ۳۰ نویسه باشد.",
  coffee: "میزان قهوه باید بین ۰ تا ۱۰ باشد.",
  bugs: "تعداد باگ باید بین ۰ تا ۱۰۰ باشد.",
  sleep: "ساعت خواب باید بین ۰ تا ۱۲ باشد.",
  confidence: "اعتمادبه‌نفس باید بین ۰ تا ۱۵۰ باشد.",
};

const updateSchema = z.object({
  nickname: z.string().trim().min(2).max(30),
  coffee: z.number().int().min(0).max(10),
  bugs: z.number().int().min(0).max(100),
  sleep: z.number().int().min(0).max(12),
  confidence: z.number().int().min(0).max(150),
});

export async function updateProfileAction(input: z.infer<typeof updateSchema>): Promise<{ error?: string; ok?: boolean }> {
  const user = await requireUser();

  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const key = String(first?.path[0] ?? "");
    return { error: FIELD_ERRORS[key] ?? "اطلاعات وارد‌شده نامعتبر است." };
  }
  const data = parsed.data;
  const avatarSeed = `${user.role}-${user.power}-${data.coffee}-${data.bugs}-${data.sleep}-${data.confidence}-${data.nickname}`;

  await prisma.user.update({
    where: { id: user.id },
    data: {
      nickname: data.nickname,
      coffee: data.coffee,
      bugs: data.bugs,
      sleep: data.sleep,
      confidence: data.confidence,
      avatarSeed,
    },
  });

  revalidatePath("/profile");
  revalidatePath("/team");
  return { ok: true };
}
