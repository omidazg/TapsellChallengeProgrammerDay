/**
 * ساخت/پاک‌سازی کاربرهای تست‌بار (load test).
 *
 * کاربرها مستقیماً در دیتابیس هدف (DATABASE_URL) ساخته می‌شوند و برایشان
 * کوکی نشست (arena_session) با jose امضا می‌شود — دقیقاً هم‌شکل با
 * createSession در src/lib/auth.ts (HS256، claims: sub, v, iat, exp=14d)
 * — بدون این‌که از سرور در حال اجرا لاگین بزنیم.
 *
 * این اسکریپت هرگز DATABASE_URL/SESSION_SECRET پیش‌فرض نمی‌گذارد؛ هر دو
 * باید صراحتاً در محیط تنظیم شوند تا هدف اشتباه (مثلاً dev.db محلی) دست‌نخورده بماند.
 *
 * اجرا:
 *   DATABASE_URL=... SESSION_SECRET=... npx tsx scripts/lib/loadtest-users.ts --count 100 --out cookies.json
 *   DATABASE_URL=... SESSION_SECRET=... npx tsx scripts/lib/loadtest-users.ts --cleanup
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import { SignJWT } from "jose";

const COOKIE_NAME = "arena_session";
const EMAIL_PREFIX = "lt-";
const EMAIL_DOMAIN = "loadtest.local";
const EMAIL_LIKE = `${EMAIL_PREFIX}%@${EMAIL_DOMAIN}`;

interface Args {
  count: number;
  out: string;
  cleanup: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { count: 100, out: "loadtest-cookies.json", cleanup: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--cleanup") args.cleanup = true;
    else if (a === "--count") args.count = Number(argv[++i]);
    else if (a === "--out") args.out = argv[++i];
    else if (a.startsWith("--")) throw new Error(`گزینهٔ ناشناخته: ${a}`);
  }
  return args;
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `${name} تنظیم نشده است. برای جلوگیری از دست‌کاری تصادفی دیتابیس اشتباه، این اسکریپت هیچ مقدار پیش‌فرضی` +
        ` برای DATABASE_URL یا SESSION_SECRET قبول نمی‌کند — هر دو را صریحاً در محیط بدهید.`
    );
  }
  return v;
}

async function mintCookie(secret: Uint8Array, userId: string): Promise<string> {
  const token = await new SignJWT({ sub: userId, v: 0 })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("14d")
    .sign(secret);
  return `${COOKIE_NAME}=${token}`;
}

async function createUsers(count: number, out: string) {
  requireEnv("DATABASE_URL");
  const sessionSecret = requireEnv("SESSION_SECRET");
  const { prisma } = await import("../../src/lib/db");
  const secretKey = new TextEncoder().encode(sessionSecret);

  // هزینهٔ bcrypt پایین (۴) عمداً است: رمزها هرگز استفاده نمی‌شوند، فقط سرعت ساخت مهم است.
  const passwordHash = await bcrypt.hash(`loadtest-${Date.now()}`, 4);

  const cookies: { n: number; email: string; userId: string; cookie: string }[] = [];
  try {
    for (let n = 0; n < count; n++) {
      const email = `${EMAIL_PREFIX}${n}@${EMAIL_DOMAIN}`;
      const user = await prisma.user.upsert({
        where: { email },
        update: {},
        create: {
          email,
          passwordHash,
          nickname: `بار-تست ${n}`,
          role: "DEALMAKER",
          power: "HYPE",
          avatarSeed: `loadtest-${n}`,
        },
        select: { id: true },
      });
      const cookie = await mintCookie(secretKey, user.id);
      cookies.push({ n, email, userId: user.id, cookie });
      if ((n + 1) % 50 === 0 || n + 1 === count) {
        console.log(`ساخته‌شده: ${n + 1}/${count}`);
      }
    }

    const outPath = path.resolve(out);
    fs.writeFileSync(outPath, JSON.stringify({ createdAt: new Date().toISOString(), count: cookies.length, users: cookies }, null, 2) + "\n");
    console.log(`\n${cookies.length} کاربر ساخته شد. کوکی‌ها نوشته شد: ${outPath}`);
  } finally {
    await prisma.$disconnect();
  }
}

async function cleanup() {
  requireEnv("DATABASE_URL");
  const { prisma } = await import("../../src/lib/db");
  try {
    const users = await prisma.user.findMany({
      where: { email: { startsWith: EMAIL_PREFIX, endsWith: `@${EMAIL_DOMAIN}` } },
      select: { id: true },
    });
    const ids = users.map((u) => u.id);
    if (ids.length === 0) {
      console.log(`هیچ کاربر تست‌باری (الگوی ${EMAIL_LIKE}) پیدا نشد.`);
      return;
    }
    console.log(`حذف ${ids.length} کاربر تست‌بار و رکوردهای وابسته...`);

    // ترتیب FK-safe: فرزندان قبل از والد (User) حذف می‌شوند؛ ترتیب دقیقاً بر اساس
    // روابط تعریف‌شده در prisma/schema.prisma (User model) است.
    const where = { userId: { in: ids } };
    await prisma.notification.deleteMany({ where });
    await prisma.pushSubscription.deleteMany({ where });
    await prisma.surveyResponse.deleteMany({ where });
    await prisma.auditLog.updateMany({ where: { actorId: { in: ids } }, data: { actorId: null } });
    await prisma.bid.deleteMany({ where });
    await prisma.heart.deleteMany({ where });
    await prisma.purchase.deleteMany({ where });
    await prisma.investment.deleteMany({ where });
    await prisma.dueDiligenceMessage.deleteMany({ where });
    await prisma.ledgerEntry.deleteMany({ where });
    await prisma.teamInvite.deleteMany({ where: { inviterId: { in: ids } } });

    const { count } = await prisma.user.deleteMany({ where: { id: { in: ids } } });
    console.log(`${count} کاربر تست‌بار حذف شد.`);
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.cleanup) await cleanup();
  else await createUsers(args.count, args.out);
}

main().catch((e) => {
  console.error("خطا:", e instanceof Error ? e.message : e);
  process.exit(1);
});
