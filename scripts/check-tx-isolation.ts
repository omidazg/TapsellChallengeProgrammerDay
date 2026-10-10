/**
 * بررسی جداسازی تراکنش: نوشتنِ بیرون از تراکنش که هم‌زمان با یک تراکنشِ rollback‌شده اجرا
 * می‌شود نباید همراه آن پاک شود (src/lib/db.ts → serializeAdapter).
 *   DATABASE_URL=file:/tmp/x.db npx tsx scripts/check-tx-isolation.ts
 */
import { prisma } from "../src/lib/db";

async function main() {
  const key = `iso-check-${Date.now()}`;
  const tx = prisma
    .$transaction(async (t) => {
      await t.setting.create({ data: { key: `${key}-tx`, value: "x" } });
      await new Promise((r) => setTimeout(r, 300));
      throw new Error("rollback on purpose");
    })
    .catch(() => "rolled back");
  await new Promise((r) => setTimeout(r, 50));
  await prisma.setting.create({ data: { key: `${key}-outside`, value: "y" } });
  await tx;
  const outside = await prisma.setting.findUnique({ where: { key: `${key}-outside` } });
  const inside = await prisma.setting.findUnique({ where: { key: `${key}-tx` } });
  await prisma.setting.deleteMany({ where: { key: { startsWith: key } } });
  console.log(JSON.stringify({ outsideKept: !!outside, txRolledBack: !inside }));
  if (!outside || inside) process.exit(1);
}

main().finally(() => prisma.$disconnect());
