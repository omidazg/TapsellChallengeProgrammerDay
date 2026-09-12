import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/db";

async function main() {
  const email = process.env.ADMIN_EMAIL || "admin@tapsell.ir";
  const password = process.env.ADMIN_PASSWORD || "admin1234";
  const hash = await bcrypt.hash(password, 10);
  await prisma.user.upsert({
    where: { email },
    update: { isAdmin: true },
    create: { email, passwordHash: hash, nickname: "برگزارکننده", role: "DEALMAKER", power: "SHIELD", isAdmin: true, avatarSeed: "admin" },
  });
  await prisma.setting.upsert({ where: { key: "phase" }, update: {}, create: { key: "phase", value: "REGISTRATION" } });
  console.log("seeded admin:", email);
}

main().finally(() => prisma.$disconnect());
