import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { prisma } from "./db";
import { redirect } from "next/navigation";

const COOKIE = "arena_session";
const secret = () => new TextEncoder().encode(process.env.SESSION_SECRET ?? "dev-secret-change-me");

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 10);
}
export async function verifyPassword(pw: string, hash: string) {
  return bcrypt.compare(pw, hash);
}

export async function createSession(userId: string) {
  const token = await new SignJWT({ sub: userId })
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

export async function getSessionUserId(): Promise<string | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

/** کاربر جاری با تیم؛ null اگر وارد نشده باشد */
export async function getCurrentUser() {
  const id = await getSessionUserId();
  if (!id) return null;
  return prisma.user.findUnique({ where: { id }, include: { team: true } });
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
