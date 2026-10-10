/**
 * ساخت یا بازنشانی یک حساب (ادمین یا بازیکن) با رمز دلخواه — idempotent.
 *
 *   ACCOUNT_EMAIL=someone@pegah.tech ACCOUNT_PASSWORD='...' ACCOUNT_ADMIN=1 npx tsx scripts/create-account.ts
 *
 * متغیرها:
 *   ACCOUNT_EMAIL     (الزامی) ایمیل ورود
 *   ACCOUNT_PASSWORD  (الزامی، حداقل ۸ نویسه) رمز تازه؛ اگر حساب وجود داشت رمزش عوض و نشست‌های قبلی باطل می‌شود
 *   ACCOUNT_ADMIN     «1» یعنی ادمین
 *   ACCOUNT_NICKNAME  نام نمایشی (پیش‌فرض: بخش قبل از @)
 *   ACCOUNT_ROLE      BUILDER | STORYTELLER | DEALMAKER (پیش‌فرض BUILDER)
 *   ACCOUNT_PHONE     موبایل ۰۹xxxxxxxxx (اختیاری)
 *
 * روی سرور (ایمیج migrate همهٔ وابستگی‌ها را دارد):
 *   docker compose run --rm -v ./scripts/create-account.ts:/app/scripts/create-account.ts:ro \
 *     -e ACCOUNT_EMAIL=... -e ACCOUNT_PASSWORD=... -e ACCOUNT_ADMIN=1 \
 *     --entrypoint npx migrate tsx scripts/create-account.ts
 *
 * برخلاف prisma/seed-test-users.ts رمزی داخل مخزن نیست، پس در production هم قابل اجراست.
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/db";
import { DEFAULTS, ROLES, type RoleKey } from "../src/lib/constants";

async function main() {
  const email = (process.env.ACCOUNT_EMAIL ?? "").trim().toLowerCase();
  const password = process.env.ACCOUNT_PASSWORD ?? "";
  const isAdmin = process.env.ACCOUNT_ADMIN === "1";
  const nickname = (process.env.ACCOUNT_NICKNAME ?? "").trim() || email.split("@")[0];
  const roleRaw = (process.env.ACCOUNT_ROLE ?? "BUILDER").toUpperCase();
  const phone = (process.env.ACCOUNT_PHONE ?? "").trim() || null;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("ACCOUNT_EMAIL نامعتبر است");
  if (password.length < 8) throw new Error("ACCOUNT_PASSWORD باید حداقل ۸ نویسه باشد");
  if (!(roleRaw in ROLES)) throw new Error(`ACCOUNT_ROLE باید یکی از ${Object.keys(ROLES).join(" | ")} باشد`);
  const role = roleRaw as RoleKey;

  const passwordHash = await bcrypt.hash(password, 10);

  const startingRow = await prisma.setting.findUnique({ where: { key: "starting_coins" } });
  const parsed = parseInt(startingRow?.value ?? "", 10);
  const startingCoins = Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULTS.startingCoins;

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  const user = await prisma.user.upsert({
    where: { email },
    // تیم و کیف فعلی دست نمی‌خورد؛ فقط رمز، دسترسی ادمین و رفع مسدودی
    update: { passwordHash, isAdmin, blockedAt: null, phone, sessionVersion: { increment: 1 } },
    create: {
      email,
      phone,
      passwordHash,
      nickname,
      role,
      power: "", // ستون قدیمی؛ قدرت‌ها از بازی حذف شده‌اند
      isAdmin,
      avatarSeed: email.split("@")[0],
      seedWallet: 0,
      buyWallet: startingCoins,
    },
    select: { id: true, email: true, isAdmin: true },
  });

  await prisma.allowedEmail.upsert({
    where: { email },
    update: phone ? { phone } : {},
    create: { email, phone, note: "ساخته‌شده با scripts/create-account.ts" },
  });

  console.log(`[create-account] ${existing ? "updated" : "created"} ${user.email} (${user.isAdmin ? "admin" : "player"})`);
}

main()
  .catch((e) => {
    console.error("[create-account]", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
