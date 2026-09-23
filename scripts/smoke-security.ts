/**
 * دود-تست امنیت — محدودیت نرخ، باطل‌شدن نشست با sessionVersion، مسدودسازی و بازنشانی رمز.
 * اجرا: npx tsx scripts/smoke-security.ts
 * همهٔ ردیف‌های ساخته‌شده در پایان پاک می‌شوند.
 */
import "dotenv/config";
import { prisma } from "../src/lib/db";
import { hashPassword, verifyPassword, isSessionValid } from "../src/lib/auth";
import { rateLimit, rateLimitMessage, resetRateLimits } from "../src/lib/rate-limit";

const TAG = "smoke-sec-" + Date.now();
const mail = (n: string) => `${TAG}-${n}@tapsell.ir`;

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, extra = "") {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name} ${extra}`);
  }
}

async function makeUser(n: string) {
  return prisma.user.create({
    data: {
      email: mail(n),
      passwordHash: await hashPassword("secret123"),
      nickname: `آزمون ${n}`,
      department: "بک‌اند",
      role: "BUILDER",
      power: "HYPE",
    },
  });
}

async function main() {
  const userIds: string[] = [];
  try {
    console.log("\n# ۱ — معنای محدودیت نرخ");
    resetRateLimits();
    const bucket = "smoke:login:ip";
    let allowed = 0;
    for (let i = 0; i < 20; i++) {
      const r = rateLimit(bucket, "1.2.3.4", { limit: 20, windowMs: 10 * 60 * 1000 });
      if (r.ok) allowed++;
    }
    check("دقیقاً به اندازهٔ سقف اجازه داده می‌شود", allowed === 20, String(allowed));
    const over = rateLimit(bucket, "1.2.3.4", { limit: 20, windowMs: 10 * 60 * 1000 });
    check("درخواست اضافه رد می‌شود", over.ok === false, JSON.stringify(over));
    if (!over.ok) {
      check("retryAfterSec مثبت است", over.retryAfterSec > 0, String(over.retryAfterSec));
      check("پیام فارسی ساخته می‌شود", rateLimitMessage(over.retryAfterSec).includes("دوباره تلاش کن"));
    }
    const otherKey = rateLimit(bucket, "9.9.9.9", { limit: 20, windowMs: 10 * 60 * 1000 });
    check("کلید دیگر مستقل است", otherKey.ok === true, JSON.stringify(otherKey));

    const emailBucket = "smoke:login:email";
    let emailAllowed = 0;
    for (let i = 0; i < 8; i++) {
      const r = rateLimit(emailBucket, "x@y.com", { limit: 8, windowMs: 10 * 60 * 1000 });
      if (r.ok) emailAllowed++;
    }
    const emailOver = rateLimit(emailBucket, "x@y.com", { limit: 8, windowMs: 10 * 60 * 1000 });
    check("سقف جداگانهٔ ایمیل هم رعایت می‌شود", emailAllowed === 8 && emailOver.ok === false);
    resetRateLimits();

    console.log("\n# ۲ — باطل‌شدن نشست با sessionVersion");
    const u1 = await makeUser("a");
    userIds.push(u1.id);
    check("نسخهٔ اولیهٔ نشست معتبر است", isSessionValid(0, u1));
    check("نسخهٔ نامعتبر رد می‌شود", !isSessionValid(1, u1));

    await prisma.user.update({ where: { id: u1.id }, data: { sessionVersion: { increment: 1 } } });
    const u1b = await prisma.user.findUniqueOrThrow({ where: { id: u1.id } });
    check("پس از افزایش، توکن قدیمی (v=0) دیگر معتبر نیست", !isSessionValid(0, u1b));
    check("توکن با نسخهٔ تازه (v=1) معتبر است", isSessionValid(1, u1b));

    console.log("\n# ۳ — کاربر مسدود");
    const u2 = await makeUser("b");
    userIds.push(u2.id);
    check("کاربر مسدودنشده با نسخهٔ درست معتبر است", isSessionValid(0, u2));
    await prisma.user.update({ where: { id: u2.id }, data: { blockedAt: new Date() } });
    const u2b = await prisma.user.findUniqueOrThrow({ where: { id: u2.id } });
    check("کاربر مسدودشده حتی با نسخهٔ درست رد می‌شود", !isSessionValid(0, u2b));

    console.log("\n# ۴ — بازنشانی رمز");
    const u3 = await makeUser("c");
    userIds.push(u3.id);
    const newPassword = "Kx7mQpR2vTwZ"; // نمونه‌ای از الگوی الفبای خوانا در actions.ts
    const newHash = await hashPassword(newPassword);
    await prisma.user.update({ where: { id: u3.id }, data: { passwordHash: newHash, sessionVersion: { increment: 1 } } });
    const u3b = await prisma.user.findUniqueOrThrow({ where: { id: u3.id } });
    check("رمز تازه با verifyPassword تأیید می‌شود", await verifyPassword(newPassword, u3b.passwordHash));
    check("رمز قدیمی دیگر کار نمی‌کند", !(await verifyPassword("secret123", u3b.passwordHash)));
    check("بازنشانی رمز نسخهٔ نشست را هم بالا می‌برد", u3b.sessionVersion === 1);
  } finally {
    console.log("\n# پاک‌سازی");
    await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.pushSubscription.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    const left = await prisma.user.count({ where: { email: { startsWith: TAG } } });
    console.log(`  کاربر باقی‌مانده: ${left}`);
    console.log(`\nنتیجه: ${pass} موفق، ${fail} ناموفق`);
  }
  process.exit(fail === 0 ? 0 : 1);
}

main();
