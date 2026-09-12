"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { verifyPassword, createSession } from "@/lib/auth";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

export async function loginAction(input: { email: string; password: string }): Promise<{ error: string } | never> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "ایمیل یا رمز عبور را کامل وارد کن." };
  }

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (!user) {
    return { error: "ایمیل یا رمز عبور اشتباه است." };
  }
  const ok = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!ok) {
    return { error: "ایمیل یا رمز عبور اشتباه است." };
  }

  await createSession(user.id);
  redirect("/");
}
