import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/db";

async function main() {
  const email = (process.env.ADMIN_EMAIL || "admin@tapsell.ir").trim().toLowerCase();
  const envPassword = process.env.ADMIN_PASSWORD;
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    // رمز ادمین موجود دست نمی‌خورد؛ فقط دسترسی ادمین تضمین می‌شود
    await prisma.user.update({ where: { email }, data: { isAdmin: true } });
    console.log("admin exists:", email);
  } else if (process.env.NODE_ENV === "production" && (!envPassword || envPassword.length < 8)) {
    // رمز پیش‌فرض عمومی (admin1234) در production یعنی تصاحب پنل ادمین؛ ساخت ادمین را رد کن
    console.error("[seed] ADMIN_PASSWORD (حداقل ۸ نویسه) تنظیم نشده؛ حساب ادمین ساخته نشد. آن را تنظیم و seed را دوباره اجرا کن.");
  } else {
    const hash = await bcrypt.hash(envPassword || "admin1234", 10);
    await prisma.user.create({
      data: { email, passwordHash: hash, nickname: "برگزارکننده", role: "DEALMAKER", power: "SHIELD", isAdmin: true, avatarSeed: "admin" },
    });
    console.log("seeded admin:", email);
  }
  await prisma.setting.upsert({ where: { key: "phase" }, update: {}, create: { key: "phase", value: "REGISTRATION" } });
}

main().finally(() => prisma.$disconnect());
