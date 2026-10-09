/**
 * تغییر مستقیم فاز برای تست محلی (بدون اعلان و بدون تسویه در CLOSED).
 *
 *   npx tsx scripts/set-phase.ts <PHASE>
 *
 * فازها: REGISTRATION | IDEATION | SEED_ROUND | BUILD | MARKET | CLOSED
 * (فاز جداگانهٔ «حراج زنده» دیگر وجود ندارد؛ حراج داخل روز بازار = MARKET اجرا می‌شود.)
 */
import "dotenv/config";
import { prisma } from "../src/lib/db";
import { PHASES, setPhase, type Phase } from "../src/lib/phase";

const p = process.argv[2]?.trim().toUpperCase() ?? "";
if (!(PHASES as readonly string[]).includes(p)) {
  const hint = p === "AUCTION" ? " — فاز AUCTION حذف شده؛ حراج زنده در MARKET اجرا می‌شود." : "";
  console.error(`فاز نامعتبر: «${p}»${hint}`);
  console.error(`فازهای مجاز: ${PHASES.join(" | ")}`);
  process.exit(1);
}
const ends = new Date(Date.now() + 24 * 3600 * 1000);
(async () => {
  await setPhase(p as Phase, ends);
  console.log("phase=" + p);
  await prisma.$disconnect();
})();
