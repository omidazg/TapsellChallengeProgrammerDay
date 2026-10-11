import { cache } from "react";
import { cookies, headers } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { prisma } from "./db";
import { redirect } from "next/navigation";
import { safeNext } from "@/app/login/next";
import { REQUEST_PATH_HEADER, SESSION_COOKIE as COOKIE, loginUrlFor } from "./session-cookie";

/**
 * تنبل (lazy) و فقط هنگام امضا/تأیید بررسی می‌شود؛ نه هنگام بارگذاری ماژول.
 * `next build` با NODE_ENV=production و بدون SESSION_SECRET اجرا می‌شود،
 * پس پرتاب خطا در سطح ماژول ساخت Docker را می‌شکند.
 */
function secret() {
  const raw = process.env.SESSION_SECRET;
  if (process.env.NODE_ENV === "production") {
    if (!raw || raw.length < 32) {
      throw new Error("SESSION_SECRET باید در محیط تولید تنظیم شود و حداقل ۳۲ نویسه باشد.");
    }
    return new TextEncoder().encode(raw);
  }
  return new TextEncoder().encode(raw ?? "dev-secret-change-me");
}

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 10);
}
export async function verifyPassword(pw: string, hash: string) {
  return bcrypt.compare(pw, hash);
}

export async function createSession(userId: string, sessionVersion: number) {
  const token = await new SignJWT({ sub: userId, v: sessionVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("14d")
    .sign(secret());
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && process.env.COOKIE_SECURE !== "false",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
}

export async function destroySession() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

/**
 * خروج: نسخهٔ نشست کاربر یک واحد بالا می‌رود تا همین توکن (و هر کپی دزدیده‌شده‌اش) دیگر
 * پذیرفته نشود، بعد کوکی پاک می‌شود. نتیجه: خروج از همهٔ دستگاه‌های همان کاربر.
 * شرط sessionVersion یعنی توکنِ از قبل باطل نمی‌تواند نشست‌های تازه‌تر را باطل کند.
 */
export async function revokeCurrentSession() {
  const session = await readSession();
  if (session) {
    await prisma.user.updateMany({
      where: { id: session.id, sessionVersion: session.v },
      data: { sessionVersion: { increment: 1 } },
    });
  }
  await destroySession();
}

/** محتوای توکن معتبر؛ null اگر کوکی نبود یا امضا نامعتبر بود */
async function readSession(): Promise<{ id: string; v: number } | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (typeof payload.sub !== "string") return null;
    return { id: payload.sub, v: typeof payload.v === "number" ? payload.v : 0 };
  } catch {
    return null;
  }
}

export async function getSessionUserId(): Promise<string | null> {
  return (await readSession())?.id ?? null;
}

/**
 * آیا نسخهٔ نشستِ توکن هنوز با کاربر همخوان است و کاربر مسدود نیست؟
 * تابع خالص برای استفاده در هر دو مسیر واقعی و تست‌های دود.
 */
export function isSessionValid(
  payloadVersion: number,
  user: { sessionVersion: number; blockedAt: Date | null }
): boolean {
  if (user.blockedAt) return false;
  return payloadVersion === user.sessionVersion;
}

/**
 * کاربر جاری با تیم؛ null اگر وارد نشده، نشست باطل‌شده یا مسدود باشد.
 * با cache() در هر درخواست فقط یک‌بار کوئری می‌زند (layout و صفحه هر دو صدایش می‌کنند).
 */
export const getCurrentUser = cache(async () => {
  const session = await readSession();
  if (!session) return null;
  const user = await prisma.user.findUnique({ where: { id: session.id }, include: { team: true } });
  if (!user || !isSessionValid(session.v, user)) return null;
  return user;
});

/**
 * برای صفحات محافظت‌شده: در نبود کاربر به ورود هدایت می‌کند.
 * مسیر فعلی را src/proxy.ts در هدر می‌گذارد تا پس از ورود به همان صفحه برگردد.
 */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    const next = safeNext((await headers()).get(REQUEST_PATH_HEADER));
    redirect(loginUrlFor(next));
  }
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (!user.isAdmin) redirect("/");
  return user;
}

/** دامنهٔ ایمیل مجاز (خالی = همه) */
export function isEmailAllowed(email: string) {
  const allowed = (process.env.ALLOWED_EMAIL_DOMAINS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (allowed.length === 0) return true;
  const domain = email.split("@")[1]?.toLowerCase();
  return !!domain && allowed.includes(domain);
}
