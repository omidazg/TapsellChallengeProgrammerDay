"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { normalizePhone } from "@/lib/phone";
import { requestOtp, verifyOtp } from "@/lib/otp";
import { toEnDigits } from "@/lib/persian";
import { rateLimit, rateLimitMessage, clientIp, OTP_IP_RULE } from "@/lib/rate-limit";

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

// ---------- شمارهٔ موبایل (برای ورود با کد پیامکی) ----------

export async function requestProfileOtpAction(rawPhone: string): Promise<{ ok: true; resendSec: number; devCode?: string } | { error: string }> {
  const user = await requireUser();
  const phone = normalizePhone(rawPhone);
  if (!phone) return { error: "شمارهٔ موبایل معتبر نیست؛ مثلاً ۰۹۱۲۱۲۳۴۵۶۷." };
  if (phone === user.phone) return { error: "این همان شمارهٔ فعلی توست." };
  const ipLimit = rateLimit("otp:ip", await clientIp(), OTP_IP_RULE());
  if (!ipLimit.ok) return { error: rateLimitMessage(ipLimit.retryAfterSec) };
  const other = await prisma.user.findUnique({ where: { phone }, select: { id: true } });
  if (other && other.id !== user.id) return { error: "این شماره به حساب دیگری وصل است." };
  const res = await requestOtp(phone, "PROFILE");
  if (!res.ok) return { error: res.error };
  return { ok: true, resendSec: res.resendSec, devCode: res.devCode };
}

/** تأیید کد و ذخیرهٔ شمارهٔ تازه روی حساب */
export async function verifyProfilePhoneAction(rawPhone: string, code: string): Promise<{ ok: true; phone: string } | { error: string }> {
  const user = await requireUser();
  const phone = normalizePhone(rawPhone);
  if (!phone) return { error: "شمارهٔ موبایل معتبر نیست." };
  const res = await verifyOtp(phone, "PROFILE", toEnDigits(String(code ?? "")).replace(/\s/g, ""));
  if (!res.ok) return { error: res.error };
  try {
    await prisma.user.update({ where: { id: user.id }, data: { phone } });
  } catch (e) {
    if ((e as { code?: string })?.code === "P2002") return { error: "این شماره به حساب دیگری وصل است." };
    throw e;
  }
  revalidatePath("/profile");
  return { ok: true, phone };
}

export async function removePhoneAction(): Promise<{ ok?: boolean; error?: string }> {
  const user = await requireUser();
  await prisma.user.update({ where: { id: user.id }, data: { phone: null } });
  revalidatePath("/profile");
  return { ok: true };
}
