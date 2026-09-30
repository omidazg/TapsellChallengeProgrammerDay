"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { hashPassword, createSession, getSessionUserId } from "@/lib/auth";
import { accessState, canRegister, type AccessState } from "@/lib/whitelist";
import { getPhase, getSettingInt } from "@/lib/phase";
import { DEFAULTS, ROLES, POWERS } from "@/lib/constants";
import { rateLimit, rateLimitMessage, clientIp, REGISTER_IP_RULE, OTP_IP_RULE } from "@/lib/rate-limit";
import { normalizePhone } from "@/lib/phone";
import { requestOtp, verifyOtp, signPhoneProof, checkPhoneProof } from "@/lib/otp";
import { toEnDigits } from "@/lib/persian";
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

/** فیلدهای مرحلهٔ اول ویزارد (اطلاعات حساب) که خطایشان زیر همان فیلد نمایش داده می‌شود */
export type AccountField = "email" | "password" | "nickname" | "department" | "phone";
export type AccountFieldErrors = Partial<Record<AccountField, string>>;
/**
 * نتیجهٔ ناموفق اکشن‌های ثبت‌نام. `error` همیشه پیام کلی است؛ اگر خطا به فیلد مشخصی برگردد
 * `fieldErrors` هم پر می‌شود. `hint` قدم بعدی کاربر را نشان می‌دهد: REQUEST → درخواست دسترسی،
 * TRACK → پیگیری درخواست در انتظار، LOGIN → ورود با حساب موجود.
 */
export type RegisterFailure = { error: string; fieldErrors?: AccountFieldErrors; hint?: "REQUEST" | "TRACK" | "LOGIN" };

const ACCOUNT_FIELDS: readonly string[] = ["email", "password", "nickname", "department", "phone"] satisfies AccountField[];

export type RegisterInput = z.infer<typeof registerSchema> & {
  next?: string | null;
  /** شمارهٔ موبایل اختیاری؛ فقط همراه گواهی تأیید (phoneProof) پذیرفته می‌شود */
  phone?: string | null;
  phoneProof?: string | null;
};

const PHONE_TAKEN = "این شماره به حساب دیگری وصل است.";
const EMAIL_TAKEN = "این ایمیل قبلاً ثبت‌نام کرده است؛ از صفحهٔ ورود وارد شو.";

function fieldFail(field: AccountField, error: string, hint?: RegisterFailure["hint"]): RegisterFailure {
  return { error, fieldErrors: { [field]: error }, ...(hint ? { hint } : {}) };
}

/** شمارهٔ اختیاری ثبت‌نام: خالی → null؛ پر ولی بدون گواهی معتبر → خطا */
function verifiedPhone(raw: string | null | undefined, proof: string | null | undefined): { phone: string | null } | RegisterFailure {
  if (!raw?.trim()) return { phone: null };
  const phone = normalizePhone(raw);
  if (!phone) return fieldFail("phone", "شمارهٔ موبایل معتبر نیست.");
  if (!checkPhoneProof(proof, phone, "REGISTER")) return fieldFail("phone", "شمارهٔ موبایل هنوز تأیید نشده؛ کد پیامکی را وارد کن یا شماره را خالی بگذار.");
  return { phone };
}

/** ارسال کد تأیید به شمارهٔ ثبت‌نام */
export async function requestRegisterOtpAction(rawPhone: string): Promise<{ ok: true; resendSec: number; devCode?: string } | { error: string }> {
  const phone = normalizePhone(rawPhone);
  if (!phone) return { error: "شمارهٔ موبایل معتبر نیست؛ مثلاً ۰۹۱۲۱۲۳۴۵۶۷." };
  const ipLimit = rateLimit("otp:ip", await clientIp(), OTP_IP_RULE());
  if (!ipLimit.ok) return { error: rateLimitMessage(ipLimit.retryAfterSec) };
  const taken = await prisma.user.findUnique({ where: { phone }, select: { id: true } });
  if (taken) return { error: `${PHONE_TAKEN} اگر حساب داری از صفحهٔ ورود با همین شماره وارد شو.` };
  const res = await requestOtp(phone, "REGISTER");
  if (!res.ok) return { error: res.error };
  return { ok: true, resendSec: res.resendSec, devCode: res.devCode };
}

/** تأیید کد ثبت‌نام؛ در صورت موفقیت گواهی کوتاه‌عمر شماره برمی‌گردد */
export async function verifyRegisterOtpAction(rawPhone: string, code: string): Promise<{ ok: true; phone: string; proof: string } | { error: string }> {
  const phone = normalizePhone(rawPhone);
  if (!phone) return { error: "شمارهٔ موبایل معتبر نیست." };
  const res = await verifyOtp(phone, "REGISTER", toEnDigits(String(code ?? "")).replace(/\s/g, ""));
  if (!res.ok) return { error: res.error };
  return { ok: true, phone, proof: signPhoneProof(phone, "REGISTER") };
}

const NOT_ALLOWED = "این ایمیل در لیست سفید رویداد نیست؛ اول درخواست دسترسی بده تا برگزارکننده تأیید کند.";

/**
 * بررسی زودهنگام ایمیل در مرحلهٔ اول ویزارد تا کاربر پنج مرحله را پر نکند و آخر کار رد شود.
 */
export async function checkRegisterEmailAction(
  rawEmail: string,
  rawPhone?: string | null,
  phoneProof?: string | null
): Promise<{ ok: true } | RegisterFailure> {
  const email = z.string().trim().toLowerCase().max(120).email().safeParse(rawEmail);
  if (!email.success) return fieldFail("email", FIELD_ERRORS.email);
  // بدون سقف، این اکشن ابزار بی‌محدودیتِ کشف ایمیل‌های لیست سفید و حساب‌های موجود بود
  const limit = rateLimit("register-check:ip", await clientIp(), REGISTER_IP_RULE());
  if (!limit.ok) return { error: rateLimitMessage(limit.retryAfterSec) };
  const existing = await prisma.user.findUnique({ where: { email: email.data }, select: { id: true } });
  if (existing) return fieldFail("email", EMAIL_TAKEN, "LOGIN");
  const ph = verifiedPhone(rawPhone, phoneProof);
  if ("error" in ph) return ph;
  if (ph.phone && (await prisma.user.findUnique({ where: { phone: ph.phone }, select: { id: true } }))) return fieldFail("phone", PHONE_TAKEN);
  // شمارهٔ تأییدشده‌ای که در لیست سفید است هم کافی است
  if (ph.phone && (await canRegister(email.data, ph.phone))) return { ok: true };
  const state: AccessState = await accessState(email.data);
  if (state === "ALLOWED") return { ok: true };
  if (state === "PENDING") return fieldFail("email", "درخواست دسترسی این ایمیل هنوز در انتظار تأیید برگزارکننده است.", "TRACK");
  return fieldFail("email", NOT_ALLOWED, "REQUEST");
}

export async function registerAction(input: RegisterInput): Promise<RegisterFailure | never> {
  // کاربر واردشده نباید بتواند حساب دوم بسازد و نشستش را جابه‌جا کند
  if (await getSessionUserId()) {
    return { error: "شما از قبل وارد شده‌اید." };
  }

  const { phase } = await getPhase();
  if (phase !== "REGISTRATION") {
    return { error: "ثبت‌نام بسته شده است." };
  }

  const ip = await clientIp();
  const ipLimit = rateLimit("register:ip", ip, REGISTER_IP_RULE());
  if (!ipLimit.ok) return { error: rateLimitMessage(ipLimit.retryAfterSec) };

  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const key = String(first?.path[0] ?? "");
    // همهٔ خطاهای مرحلهٔ اول یک‌جا برمی‌گردند تا هرکدام زیر فیلد خودش نمایش داده شود
    const fieldErrors: AccountFieldErrors = {};
    for (const issue of parsed.error.issues) {
      const k = String(issue.path[0] ?? "");
      if (ACCOUNT_FIELDS.includes(k) && FIELD_ERRORS[k]) fieldErrors[k as AccountField] ??= FIELD_ERRORS[k];
    }
    return {
      error: FIELD_ERRORS[key] ?? "اطلاعات وارد‌شده نامعتبر است.",
      ...(Object.keys(fieldErrors).length ? { fieldErrors } : {}),
    };
  }
  const data = parsed.data;

  const ph = verifiedPhone(input.phone, input.phoneProof);
  if ("error" in ph) return ph;

  if (!(await canRegister(data.email, ph.phone))) {
    return fieldFail("email", NOT_ALLOWED, "REQUEST");
  }

  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) {
    return fieldFail("email", EMAIL_TAKEN, "LOGIN");
  }

  // شماره: یا همان که کاربر تأیید کرده، یا شماره‌ای که برگزارکننده کنار ایمیلش در لیست سفید ثبت کرده
  let phone = ph.phone;
  if (!phone) {
    const listed = await prisma.allowedEmail.findUnique({ where: { email: data.email }, select: { phone: true } });
    if (listed?.phone && !(await prisma.user.findUnique({ where: { phone: listed.phone }, select: { id: true } }))) phone = listed.phone;
  } else if (await prisma.user.findUnique({ where: { phone }, select: { id: true } })) {
    return fieldFail("phone", PHONE_TAKEN);
  }

  const [seedWallet, buyWallet] = await Promise.all([
    getSettingInt("seed_wallet", DEFAULTS.seedWallet),
    getSettingInt("buy_wallet", DEFAULTS.buyWallet),
  ]);

  const passwordHash = await hashPassword(data.password);
  const avatarSeed = `${data.role}-${data.power}-${data.coffee}-${data.bugs}-${data.sleep}-${data.confidence}-${data.nickname}`;

  let session: { id: string; sessionVersion: number };
  try {
    const user = await prisma.user.create({
      data: {
        email: data.email,
        phone,
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
      select: { id: true, sessionVersion: true },
    });
    session = user;
  } catch (e) {
    // فقط نقض کلید یکتای ایمیل را به پیام «تکراری» ترجمه کن؛ بقیه خطای سرور است
    if (typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002") {
      const target = String((e as { meta?: { target?: unknown } }).meta?.target ?? "");
      return target.includes("phone") ? fieldFail("phone", PHONE_TAKEN) : fieldFail("email", EMAIL_TAKEN, "LOGIN");
    }
    return { error: "ثبت‌نام انجام نشد؛ دوباره تلاش کن." };
  }

  await createSession(session.id, session.sessionVersion);
  // بدون next: به صفحهٔ اصلی با پرچم welcome=1 برو تا راهنمای شروع (OnboardingTour) یک‌بار نمایش داده شود.
  // اگر next وجود دارد، طبق قرارداد safeNext همان مسیر محترم شمرده می‌شود و پرچم welcome رد می‌شود.
  redirect(safeNext(input.next) ?? "/?welcome=1");
}
