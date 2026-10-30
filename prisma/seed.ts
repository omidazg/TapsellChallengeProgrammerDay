import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/db";
import { DEFAULTS } from "../src/lib/constants";
import { DEFAULT_PRIZES } from "../src/lib/prizes";
import { DEFAULT_WEIGHTS, NO_BAZAAR_WEIGHTS } from "../src/lib/tracks";

/** سکهٔ رایگان اولیه: همان تنظیم starting_coins که ثبت‌نام می‌خواند (پیش‌فرض DEFAULTS.startingCoins) */
async function startingCoins() {
  const row = await prisma.setting.findUnique({ where: { key: "starting_coins" } });
  const n = parseInt(row?.value ?? "", 10);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULTS.startingCoins;
}

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
      data: {
        email,
        passwordHash: hash,
        nickname: "برگزارکننده",
        role: "DEALMAKER",
        power: "", // ستون قدیمی؛ قدرت‌ها از بازی حذف شده‌اند
        isAdmin: true,
        avatarSeed: "admin",
        // یک کیف سکهٔ واحد (کیف بذر قدیمی همیشه ۰)
        seedWallet: 0,
        buyWallet: await startingCoins(),
      },
    });
    console.log("seeded admin:", email);
  }
  await prisma.setting.upsert({ where: { key: "phase" }, update: {}, create: { key: "phase", value: "LIVE" } });
  await seedTracksAndPrizes();
}

/** محورها و جوایز پیش‌فرض؛ ردیف موجود دست نمی‌خورد تا تغییرات پنل ادمین حفظ شود. */
async function seedTracksAndPrizes() {
  const tracks = [
    { id: "general", name: "محور عمومی", description: "ساخت محصول و انتشار روی بازار", kind: "PRODUCT", category: "MIXED", status: "open", order: 0, weights: DEFAULT_WEIGHTS },
    { id: "content", name: "تولید محتوا", description: "ویدیو، پادکست، دوره، فیلم، موسیقی یا هر راهکار محتوایی", kind: "CONTENT", category: "NON_TECH", status: "open", order: 1, weights: NO_BAZAAR_WEIGHTS },
    { id: "os", name: "راهکار OS", description: "راهکار برای مسائل تیم OS", kind: "OS", category: "TECH", status: "hidden", order: 2, weights: NO_BAZAAR_WEIGHTS },
  ];
  for (const { weights, ...t } of tracks) {
    await prisma.track.upsert({ where: { id: t.id }, update: {}, create: { ...t, weights: JSON.stringify(weights) } });
  }
  if ((await prisma.prize.count()) === 0) {
    await prisma.prize.createMany({ data: DEFAULT_PRIZES.map((p, order) => ({ ...p, order })) });
  }
}

main().finally(() => prisma.$disconnect());
