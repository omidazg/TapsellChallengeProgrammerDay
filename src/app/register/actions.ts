"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { hashPassword, isEmailAllowed, createSession, getSessionUserId } from "@/lib/auth";
import { getPhase, getSettingInt } from "@/lib/phase";
import { DEFAULTS, ROLES, POWERS } from "@/lib/constants";
import { DEPARTMENTS } from "./departments";
import { safeNext } from "./next";


const FIELD_ERRORS: Record<string, string> = {
  email: "ایمیل نامعتبر است.",
  password: "رمز عبور باید حداقل ۶ نویسه باشد.",
  nickname: "نام مستعار باید بین ۲ تا ۳۰ نویسه باشد.",
  department: "دپارتمان را انتخاب کنید.",
  role: "یک نقش انتخاب کنید.",
  power: "یک قدرت انتخاب کنید.",
  coffee: "میزان قهوه باید بین ۰ تا ۱۰ باشد.",
  bugs: "تعداد باگ باید بین ۰ تا ۱۰۰ باشد.",
  sleep: "ساعت خواب باید بین ۰ تا ۱۲ باشد.",
  confidence: "اعتمادبه‌نفس باید بین ۰ تا ۱۵۰ باشد.",
};

const registerSchema = z.object({
  email: z.string().trim().toLowerCase().max(120).email(),
  password: z.string().min(6).max(72),
  nickname: z.string().trim().min(2).max(30),
  department: z.enum(DEPARTMENTS),
  role: z.enum(Object.keys(ROLES) as [keyof typeof ROLES, ...(keyof typeof ROLES)[]]),
  power: z.enum(Object.keys(POWERS) as [keyof typeof POWERS, ...(keyof typeof POWERS)[]]),
  coffee: z.number().int().min(0).max(10),
  bugs: z.number().int().min(0).max(100),
  sleep: z.number().int().min(0).max(12),
  confidence: z.number().int().min(0).max(150),
});

export type RegisterInput = z.infer<typeof registerSchema> & { next?: string | null };

export async function registerAction(input: RegisterInput): Promise<{ error: string } | never> {
  // کاربر واردشده نباید بتواند حساب دوم بسازد و نشستش را جابه‌جا کند
  if (await getSessionUserId()) {
    return { error: "شما از قبل وارد شده‌اید." };
  }

  const { phase } = await getPhase();
  if (phase !== "REGISTRATION") {
    return { error: "ثبت‌نام بسته شده است." };
  }

  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const key = String(first?.path[0] ?? "");
    return { error: FIELD_ERRORS[key] ?? "اطلاعات وارد‌شده نامعتبر است." };
  }
  const data = parsed.data;

  if (!isEmailAllowed(data.email)) {
    return { error: "این ایمیل مجاز به ثبت‌نام نیست." };
  }

  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) {
    return { error: "این ایمیل قبلاً ثبت‌نام کرده است." };
  }

  const [seedWallet, buyWallet] = await Promise.all([
    getSettingInt("seed_wallet", DEFAULTS.seedWallet),
    getSettingInt("buy_wallet", DEFAULTS.buyWallet),
  ]);

  const passwordHash = await hashPassword(data.password);
  const avatarSeed = `${data.role}-${data.power}-${data.coffee}-${data.bugs}-${data.sleep}-${data.confidence}-${data.nickname}`;

  let userId: string;
  try {
    const user = await prisma.user.create({
      data: {
        email: data.email,
        passwordHash,
        nickname: data.nickname,
        department: data.department,
        role: data.role,
        power: data.power,
        coffee: data.coffee,
        bugs: data.bugs,
        sleep: data.sleep,
        confidence: data.confidence,
        avatarSeed,
        seedWallet,
        buyWallet,
      },
    });
    userId = user.id;
  } catch (e) {
    // فقط نقض کلید یکتای ایمیل را به پیام «تکراری» ترجمه کن؛ بقیه خطای سرور است
    if (typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002") {
      return { error: "این ایمیل قبلاً ثبت‌نام کرده است." };
    }
    return { error: "ثبت‌نام انجام نشد؛ دوباره تلاش کن." };
  }

  await createSession(userId);
  redirect(safeNext(input.next) ?? "/team");
}
