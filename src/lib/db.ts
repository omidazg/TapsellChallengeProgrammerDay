import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

/**
 * Prisma 7: اتصال از طریق driver adapter انجام می‌شود (بدون engine باینری).
 * مسیر فایل SQLite از DATABASE_URL (مثل file:./dev.db) خوانده می‌شود.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function makeClient() {
  const url = process.env.DATABASE_URL ?? "file:./dev.db";
  // WAL: خواندن‌های هم‌زمان در حین نوشتن مسدود نمی‌شوند (مهم برای polling حراج و اعلان‌ها)
  const adapter = new PrismaBetterSqlite3({ url, timeout: 5000 });
  const client = new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
  client.$queryRawUnsafe("PRAGMA journal_mode=WAL").catch(() => {});
  client.$queryRawUnsafe("PRAGMA synchronous=NORMAL").catch(() => {});
  return client;
}

export const prisma = globalForPrisma.prisma ?? makeClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
