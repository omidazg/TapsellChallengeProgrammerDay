/**
 * تغییر مستقیم وضعیت مسابقه برای تست محلی (بدون اعلان و بدون تسویه در CLOSED).
 *
 *   npx tsx scripts/set-phase.ts <LIVE|CLOSED>
 *
 * مسابقه فقط دو وضعیت دارد: در جریان (LIVE) و پایان‌یافته (CLOSED).
 * باز و بسته کردن هر بخش از پنل برگزارکننده انجام می‌شود.
 */
import "dotenv/config";
import { prisma } from "../src/lib/db";
import { PHASES, setPhase, type Phase } from "../src/lib/phase";

const p = process.argv[2]?.trim().toUpperCase() ?? "";
if (!(PHASES as readonly string[]).includes(p)) {
  console.error(`وضعیت نامعتبر: «${p}»`);
  console.error(`وضعیت‌های مجاز: ${PHASES.join(" | ")}`);
  process.exit(1);
}
const ends = new Date(Date.now() + 24 * 3600 * 1000);
(async () => {
  await setPhase(p as Phase, ends);
  console.log("phase=" + p);
  await prisma.$disconnect();
})();
