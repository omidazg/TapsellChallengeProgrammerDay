/**
 * ساخت سطرهای گم‌شدهٔ دفتر کل خزانه (wallet = TREASURY) برای سرمایه‌گذاری‌های قدیمی.
 * اجرا: npx tsx scripts/backfill-treasury-ledger.ts
 *
 * ایدمپوتنت است: اگر برای یک سرمایه‌گذاری از قبل سطر TREASURY با همان refId وجود داشته باشد،
 * از آن رد می‌شود. اجرای چندباره چیزی را دوباره نمی‌سازد.
 */
import { createRequire } from "node:module";
import path from "node:path";

// `src/lib/db` پکیج `server-only` را import می‌کند که بیرون از Next خطا می‌دهد.
const nodeRequire = createRequire(__filename);
try {
  const id = nodeRequire.resolve("server-only");
  nodeRequire.cache[id] = {
    id,
    filename: id,
    path: path.dirname(id),
    loaded: true,
    exports: {},
    children: [],
    paths: [],
  } as unknown as NodeJS.Module;
} catch {
  // نصب نیست؛ کاری لازم نیست
}

async function main() {
  const { prisma } = await import("../src/lib/db");

  const investments = await prisma.investment.findMany({
    select: { id: true, amount: true, createdAt: true, selfFunded: true, idea: { select: { teamId: true } } },
    orderBy: { createdAt: "asc" },
  });

  const existing = await prisma.ledgerEntry.findMany({
    where: { wallet: "TREASURY", reason: "INVEST", refId: { not: null } },
    select: { refId: true },
  });
  const done = new Set(existing.map((e) => e.refId));

  let created = 0;
  let skipped = 0;
  for (const inv of investments) {
    if (done.has(inv.id)) {
      skipped += 1;
      continue;
    }
    await prisma.ledgerEntry.create({
      data: {
        teamId: inv.idea.teamId,
        wallet: "TREASURY",
        delta: inv.amount,
        reason: "INVEST",
        refId: inv.id,
        createdAt: inv.createdAt,
      },
    });
    created += 1;
  }

  console.log(`سرمایه‌گذاری‌ها: ${investments.length} | ساخته‌شده: ${created} | از قبل موجود: ${skipped}`);
  await prisma.$disconnect();
}

void main();
