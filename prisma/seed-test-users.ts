/**
 * کاربران آزمایشی برای تست دستی سیستم (idempotent).
 *
 *   npm run db:seed-test
 *
 * هر بار اجرا: کاربران زیر ساخته می‌شوند یا رمزشان به مقدار ثابت برمی‌گردد، مسدودی‌شان
 * برداشته می‌شود، در لیست سفید قرار می‌گیرند و دو تیم آزمایشی پر می‌شود. یک درخواست
 * دسترسی در انتظار هم ساخته می‌شود تا جریان «تأیید ادمین» قابل تست باشد.
 *
 * رمزها در مخزن عمومی‌اند؛ پس در محیط production فقط با ALLOW_TEST_USERS=1 اجرا می‌شود
 * (مثلاً روی استیجینگ با SEED_TEST_USERS=1 در docker/entrypoint.sh).
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/db";

const DOMAIN = "arena.test";
const TEST_ADMIN_PASSWORD = "TestAdmin#1404";
const TEST_PLAYER_PASSWORD = "Test#1404";

type TestUser = {
  local: string;
  nickname: string;
  firstName: string;
  lastName: string;
  position: string;
  department: string;
  role: "BUILDER" | "STORYTELLER" | "DEALMAKER";
  power: "HYPE" | "BARGAIN" | "ANGEL" | "SECOND_WIND" | "INSIDER" | "SHIELD";
  isAdmin?: boolean;
  team?: "A" | "B";
};

const USERS: TestUser[] = [
  { local: "test.admin", nickname: "ادمین آزمایشی", firstName: "ادمین", lastName: "آزمایشی", position: "برگزارکننده", department: "سایر", role: "DEALMAKER", power: "SHIELD", isAdmin: true },
  { local: "test1", nickname: "آزمایشی ۱", firstName: "علی", lastName: "تست‌یک", position: "توسعه‌دهندهٔ بک‌اند", department: "بک‌اند", role: "BUILDER", power: "HYPE", team: "A" },
  { local: "test2", nickname: "آزمایشی ۲", firstName: "سارا", lastName: "تست‌دو", position: "طراح محصول", department: "طراحی", role: "STORYTELLER", power: "BARGAIN", team: "A" },
  { local: "test3", nickname: "آزمایشی ۳", firstName: "رضا", lastName: "تست‌سه", position: "کارشناس فروش", department: "فروش", role: "DEALMAKER", power: "ANGEL", team: "A" },
  { local: "test4", nickname: "آزمایشی ۴", firstName: "مریم", lastName: "تست‌چهار", position: "توسعه‌دهندهٔ موبایل", department: "موبایل", role: "BUILDER", power: "SECOND_WIND", team: "B" },
  { local: "test5", nickname: "آزمایشی ۵", firstName: "نیما", lastName: "تست‌پنج", position: "مدیر محصول", department: "محصول", role: "STORYTELLER", power: "INSIDER", team: "B" },
  { local: "test6", nickname: "آزمایشی ۶", firstName: "لیلا", lastName: "تست‌شش", position: "کارشناس مارکتینگ", department: "مارکتینگ", role: "DEALMAKER", power: "SHIELD", team: "B" },
  { local: "test7", nickname: "آزمایشی ۷", firstName: "امید", lastName: "بی‌تیم", position: "تحلیلگر داده", department: "دیتا", role: "BUILDER", power: "HYPE" },
  { local: "test8", nickname: "آزمایشی ۸", firstName: "نگار", lastName: "بی‌تیم", position: "توسعه‌دهندهٔ فرانت‌اند", department: "فرانت‌اند", role: "STORYTELLER", power: "BARGAIN" },
];

const TEAMS = {
  A: { name: "تیم آزمایشی الف", slug: "test-team-a" },
  B: { name: "تیم آزمایشی ب", slug: "test-team-b" },
} as const;

/** در لیست سفید هست ولی حساب ندارد: برای تست مسیر ثبت‌نام */
const WHITELISTED_ONLY = { email: `newcomer@${DOMAIN}`, firstName: "تازه", lastName: "وارد", position: "کارآموز", unit: "بک‌اند" };
/** درخواست دسترسی در انتظار: برای تست تأیید/رد ادمین */
const PENDING_REQUEST = { email: `pending@${DOMAIN}`, firstName: "منتظر", lastName: "تأیید", position: "کارشناس منابع انسانی", unit: "منابع انسانی" };

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_TEST_USERS !== "1") {
    console.error("[seed-test-users] در production فقط با ALLOW_TEST_USERS=1 اجرا می‌شود.");
    process.exit(1);
  }

  const [adminHash, playerHash] = await Promise.all([
    bcrypt.hash(TEST_ADMIN_PASSWORD, 10),
    bcrypt.hash(TEST_PLAYER_PASSWORD, 10),
  ]);

  const teamIds: Record<string, string> = {};
  for (const [key, t] of Object.entries(TEAMS)) {
    const team = await prisma.team.upsert({
      where: { slug: t.slug },
      update: {},
      create: { name: t.name, slug: t.slug, logoSeed: t.slug },
    });
    teamIds[key] = team.id;
  }

  for (const u of USERS) {
    const email = `${u.local}@${DOMAIN}`;
    const passwordHash = u.isAdmin ? adminHash : playerHash;
    const teamId = u.team ? teamIds[u.team] : undefined;
    await prisma.user.upsert({
      where: { email },
      // تیم فعلی دست نمی‌خورد تا جابه‌جایی‌های حین تست با اجرای دوباره پاک نشود
      update: { passwordHash, blockedAt: null, isAdmin: !!u.isAdmin },
      create: {
        email,
        passwordHash,
        nickname: u.nickname,
        department: u.department,
        role: u.role,
        power: u.power,
        isAdmin: !!u.isAdmin,
        avatarSeed: `test-${u.local}`,
        teamId,
      },
    });
    await prisma.allowedEmail.upsert({
      where: { email },
      update: {},
      create: { email, firstName: u.firstName, lastName: u.lastName, position: u.position, unit: u.department, note: "کاربر آزمایشی" },
    });
  }

  await prisma.allowedEmail.upsert({
    where: { email: WHITELISTED_ONLY.email },
    update: {},
    create: { ...WHITELISTED_ONLY, note: "کاربر آزمایشی (بدون حساب)" },
  });
  await prisma.accessRequest.upsert({
    where: { email: PENDING_REQUEST.email },
    update: {},
    create: PENDING_REQUEST,
  });

  console.log("[seed-test-users] done:");
  for (const u of USERS) {
    const team = u.team ? TEAMS[u.team].name : "بدون تیم";
    console.log(`  ${u.local}@${DOMAIN}  ${u.isAdmin ? TEST_ADMIN_PASSWORD : TEST_PLAYER_PASSWORD}  ${u.isAdmin ? "ادمین" : team}`);
  }
}

main().finally(() => prisma.$disconnect());
