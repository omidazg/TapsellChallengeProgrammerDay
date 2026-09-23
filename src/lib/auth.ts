import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { prisma } from "./db";
import { redirect } from "next/navigation";

const COOKIE = "arena_session";

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

/** کاربر جاری با تیم؛ null اگر وارد نشده، نشست باطل‌شده یا مسدود باشد */
export async function getCurrentUser() {
  const session = await readSession();
  if (!session) return null;
  const user = await prisma.user.findUnique({ where: { id: session.id }, include: { team: true } });
  if (!user || !isSessionValid(session.v, user)) return null;
  return user;
}

/** برای صفحات محافظت‌شده: در نبود کاربر به ورود هدایت می‌کند */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
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
