/**
 * کاربران آزمایشی برای تست دستی سیستم (idempotent).
 *
 *   npm run db:seed-test
 *
 * هر بار اجرا: کاربران زیر ساخته می‌شوند یا رمزشان به مقدار ثابت برمی‌گردد، مسدودی‌شان
 * برداشته می‌شود و در لیست سفید قرار می‌گیرند. تیم‌های آزمایشی هر اندازهٔ مجاز را پوشش می‌دهند:
 * دو تیم سه‌نفره (الف و ب)، یک تیم دونفره و یک شرکت فردی (Team.solo). یک درخواست
 * دسترسی در انتظار هم ساخته می‌شود تا جریان «تأیید ادمین» قابل تست باشد.
 *
 * کاربر تازه با سکهٔ اولیهٔ starting_coins در کیف سکه ساخته می‌شود (مثل ثبت‌نام)؛ کیف کاربر
 * موجود دست نمی‌خورد تا خرج‌های حین تست با اجرای دوباره پاک نشود.
 *
 * رمزها در مخزن عمومی‌اند؛ پس در محیط production فقط با ALLOW_TEST_USERS=1 اجرا می‌شود
 * (مثلاً روی استیجینگ با SEED_TEST_USERS=1 در docker/entrypoint.sh).
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/db";
import { DEFAULTS, type RoleKey } from "../src/lib/constants";

const DOMAIN = "arena.test";
const TEST_ADMIN_PASSWORD = "TestAdmin#1404";
const TEST_PLAYER_PASSWORD = "Test#1404";

const TEAMS = {
  A: { name: "تیم آزمایشی الف", slug: "test-team-a", solo: false },
  B: { name: "تیم آزمایشی ب", slug: "test-team-b", solo: false },
  DUO: { name: "تیم دونفرهٔ آزمایشی", slug: "test-team-duo", solo: false },
  SOLO: { name: "شرکت فردی آزمایشی", slug: "test-solo", solo: true },
} as const;
type TeamKey = keyof typeof TEAMS;

type TestUser = {
  local: string;
  /** شمارهٔ تلفن آزمایشی (testPhone)؛ ۰۹ و ۱۰ مال WHITELISTED_ONLY و PENDING_REQUEST است */
  phoneNo: number;
  nickname: string;
  firstName: string;
  lastName: string;
  position: string;
  department: string;
  role: RoleKey; // فقط برچسب مهارت
  isAdmin?: boolean;
  team?: TeamKey;
};

const USERS: TestUser[] = [
  { local: "test.admin", phoneNo: 0, nickname: "ادمین آزمایشی", firstName: "ادمین", lastName: "آزمایشی", position: "برگزارکننده", department: "سایر", role: "DEALMAKER", isAdmin: true },
  { local: "test1", phoneNo: 1, nickname: "آزمایشی ۱", firstName: "علی", lastName: "تست‌یک", position: "توسعه‌دهندهٔ بک‌اند", department: "بک‌اند", role: "BUILDER", team: "A" },
  { local: "test2", phoneNo: 2, nickname: "آزمایشی ۲", firstName: "سارا", lastName: "تست‌دو", position: "طراح محصول", department: "طراحی", role: "STORYTELLER", team: "A" },
  { local: "test3", phoneNo: 3, nickname: "آزمایشی ۳", firstName: "رضا", lastName: "تست‌سه", position: "کارشناس فروش", department: "فروش", role: "DEALMAKER", team: "A" },
  { local: "test4", phoneNo: 4, nickname: "آزمایشی ۴", firstName: "مریم", lastName: "تست‌چهار", position: "توسعه‌دهندهٔ موبایل", department: "موبایل", role: "BUILDER", team: "B" },
  { local: "test5", phoneNo: 5, nickname: "آزمایشی ۵", firstName: "نیما", lastName: "تست‌پنج", position: "مدیر محصول", department: "محصول", role: "STORYTELLER", team: "B" },
  { local: "test6", phoneNo: 6, nickname: "آزمایشی ۶", firstName: "لیلا", lastName: "تست‌شش", position: "کارشناس مارکتینگ", department: "مارکتینگ", role: "DEALMAKER", team: "B" },
  { local: "test7", phoneNo: 7, nickname: "آزمایشی ۷", firstName: "امید", lastName: "بی‌تیم", position: "تحلیلگر داده", department: "دیتا", role: "BUILDER" },
  { local: "test8", phoneNo: 8, nickname: "آزمایشی ۸", firstName: "نگار", lastName: "بی‌تیم", position: "توسعه‌دهندهٔ فرانت‌اند", department: "فرانت‌اند", role: "STORYTELLER" },
  { local: "test9", phoneNo: 11, nickname: "آزمایشی ۹", firstName: "کاوه", lastName: "تک‌نفره", position: "توسعه‌دهندهٔ فول‌استک", department: "بک‌اند", role: "BUILDER", team: "SOLO" },
  { local: "test10", phoneNo: 12, nickname: "آزمایشی ۱۰", firstName: "پریسا", lastName: "دونفره", position: "طراح تجربهٔ کاربری", department: "طراحی", role: "STORYTELLER", team: "DUO" },
  { local: "test11", phoneNo: 13, nickname: "آزمایشی ۱۱", firstName: "بهراد", lastName: "دونفره", position: "توسعه‌دهندهٔ بک‌اند", department: "بک‌اند", role: "BUILDER", team: "DUO" },
];

/** شماره‌های آزمایشی ۰۹۹۹۹۹۹۹۹xx: هرگز پیامک واقعی نمی‌گیرند (lib/phone.ts) — کد در لاگ سرور/صفحه نمایش داده می‌شود */
const testPhone = (n: number) => `099999999${String(n).padStart(2, "0")}`;

/** در لیست سفید هست ولی حساب ندارد: برای تست مسیر ثبت‌نام */
const WHITELISTED_ONLY = { email: `newcomer@${DOMAIN}`, phone: testPhone(9), firstName: "تازه", lastName: "وارد", position: "کارآموز", unit: "بک‌اند" };
/** درخواست دسترسی در انتظار: برای تست تأیید/رد ادمین */
const PENDING_REQUEST = { email: `pending@${DOMAIN}`, phone: testPhone(10), firstName: "منتظر", lastName: "تأیید", position: "کارشناس منابع انسانی", unit: "منابع انسانی" };

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_TEST_USERS !== "1") {
    console.error("[seed-test-users] در production فقط با ALLOW_TEST_USERS=1 اجرا می‌شود.");
    process.exit(1);
  }

  const [adminHash, playerHash] = await Promise.all([
    bcrypt.hash(TEST_ADMIN_PASSWORD, 10),
    bcrypt.hash(TEST_PLAYER_PASSWORD, 10),
  ]);

  // یک کیف سکهٔ واحد: سکهٔ رایگان اولیه مثل ثبت‌نام (src/app/register/actions.ts)
  const startingRow = await prisma.setting.findUnique({ where: { key: "starting_coins" } });
  const parsedStarting = parseInt(startingRow?.value ?? "", 10);
  const startingCoins = Number.isFinite(parsedStarting) && parsedStarting >= 0 ? parsedStarting : DEFAULTS.startingCoins;

  const teamIds = {} as Record<TeamKey, string>;
  for (const [key, t] of Object.entries(TEAMS) as [TeamKey, (typeof TEAMS)[TeamKey]][]) {
    const team = await prisma.team.upsert({
      where: { slug: t.slug },
      update: {},
      create: { name: t.name, slug: t.slug, logoSeed: t.slug, solo: t.solo },
    });
    teamIds[key] = team.id;
  }

  for (const u of USERS) {
    const email = `${u.local}@${DOMAIN}`;
    const phone = testPhone(u.phoneNo);
    const passwordHash = u.isAdmin ? adminHash : playerHash;
    const teamId = u.team ? teamIds[u.team] : undefined;
    await prisma.user.upsert({
      where: { email },
      // تیم و کیف فعلی دست نمی‌خورد تا جابه‌جایی‌ها و خرج‌های حین تست با اجرای دوباره پاک نشود
      update: { passwordHash, blockedAt: null, isAdmin: !!u.isAdmin, phone },
      create: {
        email,
        phone,
        passwordHash,
        nickname: u.nickname,
        department: u.department,
        role: u.role,
        power: "", // ستون قدیمی؛ قدرت‌ها از بازی حذف شده‌اند
        isAdmin: !!u.isAdmin,
        avatarSeed: `test-${u.local}`,
        seedWallet: 0,
        buyWallet: startingCoins,
        teamId,
      },
    });
    await prisma.allowedEmail.upsert({
      where: { email },
      update: { phone },
      create: { email, phone, firstName: u.firstName, lastName: u.lastName, position: u.position, unit: u.department, note: "کاربر آزمایشی" },
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
    console.log(`  ${u.local}@${DOMAIN}  ${u.isAdmin ? TEST_ADMIN_PASSWORD : TEST_PLAYER_PASSWORD}  ${testPhone(u.phoneNo)}  ${u.isAdmin ? "ادمین" : team}`);
  }
}

main().finally(() => prisma.$disconnect());
