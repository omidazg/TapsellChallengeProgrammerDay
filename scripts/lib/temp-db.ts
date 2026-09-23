/**
 * ابزار مشترک برای دود-تست‌ها و تست‌های واحد: یک پایگاه‌دادهٔ SQLite موقت و یکتا
 * می‌سازد، مایگریشن‌های prisma/migrations را با `prisma migrate deploy` رویش اجرا
 * می‌کند و آدرس آن را در process.env.DATABASE_URL می‌گذارد.
 *
 * نکتهٔ مهم: این تابع باید **پیش از** import شدن `../../src/lib/db` (یا هر ماژولی
 * که آن را import می‌کند) فراخوانی شود، چون Prisma آدرس اتصال را فقط یک‌بار، در
 * لحظهٔ import، از process.env.DATABASE_URL می‌خواند. پس فراخوانندهٔ این تابع باید
 * prisma را به‌صورت پویا (dynamic `import()`) *بعد* از فراخوانی createTempDb بارگذاری
 * کند، نه با `import ... from` در بالای فایل:
 *
 *   import { createTempDb } from "./lib/temp-db";
 *   const db = createTempDb("my-test");
 *   const { prisma } = await import("../src/lib/db");
 *   try {
 *     // ...
 *   } finally {
 *     await prisma.$disconnect();
 *     db.cleanup();
 *   }
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..");

export type TempDb = {
  /** مقدار قابل استفاده برای process.env.DATABASE_URL (فرمت file:...) */
  url: string;
  /** مسیر فایل sqlite روی دیسک */
  file: string;
  /** فایل و فایل‌های جانبی WAL/SHM/journal را پاک می‌کند */
  cleanup: () => void;
};

/** true اگر یک مقدار DATABASE_URL آشکارا به یک فایل موقت اشاره می‌کند (نه dev.db واقعی) */
export function isTempDatabaseUrl(url: string | undefined): boolean {
  if (!url) return false;
  const normalized = url.replace(/^file:/, "").replace(/\\/g, "/").toLowerCase();
  if (normalized.endsWith("/dev.db") || normalized === "dev.db" || normalized === "./dev.db") return false;
  const tmp = os.tmpdir().replace(/\\/g, "/").toLowerCase();
  return normalized.includes("/tmp/") || normalized.includes(tmp) || normalized.includes("temp/");
}

/**
 * پایگاه‌دادهٔ موقت جدید می‌سازد و مایگریت می‌کند. `label` فقط برای خوانایی نام فایل
 * است (مثلاً نام اسکریپت دود-تست یا فایل تست).
 */
export function createTempDb(label = "tmp"): TempDb {
  const safeLabel = label.replace(/[^a-zA-Z0-9_-]/g, "-");
  const file = path.join(
    os.tmpdir(),
    `arena-${safeLabel}-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.db`
  );
  const url = `file:${file.replace(/\\/g, "/")}`;

  try {
    execSync("npx prisma migrate deploy", {
      cwd: ROOT,
      env: { ...process.env, DATABASE_URL: url },
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (e) {
    const out = e && typeof e === "object" ? (e as { stdout?: Buffer; stderr?: Buffer }) : {};
    const detail = [out.stdout?.toString(), out.stderr?.toString()].filter(Boolean).join("\n");
    throw new Error(`ساخت پایگاه‌دادهٔ موقت (${label}) شکست خورد:\n${detail || String(e)}`);
  }

  // پیش‌شرط مستندشده در بالای فایل: این تابع باید پیش از import شدن prisma فراخوانی شود.
  process.env.DATABASE_URL = url;

  const cleanup = () => {
    for (const suffix of ["", "-journal", "-wal", "-shm"]) {
      try {
        fs.rmSync(file + suffix, { force: true });
      } catch {
        // بی‌اهمیت: پاک‌سازی best-effort است
      }
    }
  };

  return { url, file, cleanup };
}
