import "dotenv/config";
import { prisma } from "../src/lib/db";
const p = process.argv[2];
const ends = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
(async () => {
  await prisma.setting.upsert({ where: { key: "phase" }, update: { value: p }, create: { key: "phase", value: p } });
  await prisma.setting.upsert({ where: { key: "phase_ends_at" }, update: { value: ends }, create: { key: "phase_ends_at", value: ends } });
  console.log("phase=" + p);
  await prisma.$disconnect();
})();
