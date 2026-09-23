/**
 * دود-تست آیتم‌های ۴۸ (روند فروش/سرمایه) و ۴۹ (خروجی اکسل کامل).
 * اجرا: npx tsx scripts/smoke-reports.ts
 *
 * روی یک پایگاه‌دادهٔ SQLite موقت (`smoke-reports.db`، کنار همین اسکریپت‌ها) کار می‌کند —
 * همان الگوی scripts/smoke-settlement.ts؛ فایل پیش و پس از اجرا پاک می‌شود.
 *
 * سناریو: ۲ تیم، چند سرمایه‌گذاری و خرید در زمان‌های پخش‌شده (برای آزمودن سطل‌های زمانی)،
 * سپس settleGame، و در پایان خروجی xlsx کامل با exceljs خوانده و بررسی می‌شود.
 */

import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

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

const ROOT = path.resolve(__dirname, "..");
const DB_FILE = path.join(ROOT, "smoke-reports.db");
const DB_URL = `file:${DB_FILE.replace(/\\/g, "/")}`;
process.env.DATABASE_URL = DB_URL;

const checks: { name: string; ok: boolean; detail: string }[] = [];
function check(name: string, ok: boolean, detail = "") {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} — ${name}${detail ? ` (${detail})` : ""}`);
}

function cleanTempFiles() {
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const f = `${DB_FILE}${suffix}`;
    if (existsSync(f)) rmSync(f, { force: true });
  }
}

function pushSchema() {
  cleanTempFiles();
  execFileSync("npx", ["prisma", "db", "push", "--url", DB_URL], {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: DB_URL },
    stdio: "inherit",
    shell: process.platform === "win32",
  });
}

async function main() {
  pushSchema();

  const { prisma } = await import("../src/lib/db");
  const { investCore } = await import("../src/lib/invest");
  const { settleGame } = await import("../src/lib/settlement");
  const { setPhase } = await import("../src/lib/phase");
  const { loadTimeline } = await import("../src/lib/timeline");
  const { buildExportWorkbookBuffer } = await import("../src/app/admin/export/xlsx/route");
  const ExcelJS = (await import("exceljs")).default;

  try {
    await prisma.setting.create({ data: { key: "penalty_per_coin", value: "1.5" } });
    await prisma.setting.create({ data: { key: "max_per_target", value: "60" } });

    const teamIds: Record<string, string> = {};
    const ideaIds: Record<string, string> = {};
    const productIds: Record<string, string> = {};
    const userIds: Record<string, string> = {};

    const SPEC = [
      { key: "alpha", name: "تیم آلفا گزارش", revenueShare: 50, jury: 85 },
      { key: "beta", name: "تیم بتا گزارش", revenueShare: 40, jury: 65 },
    ];
    for (const t of SPEC) {
      const team = await prisma.team.create({ data: { name: t.name, slug: `smoke-report-${t.key}` } });
      teamIds[t.key] = team.id;
      for (let i = 1; i <= 2; i++) {
        const u = await prisma.user.create({
          data: {
            email: `report-${t.key}-${i}@example.test`,
            passwordHash: "SHOULD-NOT-LEAK",
            nickname: `${t.name} ${i}`,
            role: "DEALMAKER",
            power: "HYPE",
            teamId: team.id,
            seedWallet: 200,
            buyWallet: 200,
          },
        });
        userIds[`${t.key}${i}`] = u.id;
      }
      const idea = await prisma.idea.create({
        data: {
          teamId: team.id,
          title: `ایدهٔ ${t.name}`,
          oneLiner: "یک خطی",
          problem: "مسئله",
          audience: "مخاطب",
          buildPlan: "برنامه",
          fundingCap: 300,
          revenueShare: t.revenueShare,
          submittedAt: new Date(),
        },
      });
      ideaIds[t.key] = idea.id;
      const product = await prisma.product.create({
        data: { teamId: team.id, name: `محصول ${t.name}`, price: 20, submittedAt: new Date(), juryQuality: t.jury, juryTeaser: t.jury - 5 },
      });
      productIds[t.key] = product.id;
    }

    // ---------- رویدادها در زمان‌های پخش‌شده (برای آزمودن سطل‌های زمانی) ----------
    const T0 = Date.parse("2026-01-01T00:00:00.000Z");
    const HOUR = 3600_000;

    await setPhase("SEED_ROUND", null);
    const invests = [
      { team: "alpha", user: "beta1", amount: 50, at: T0 + 1 * HOUR },
      { team: "alpha", user: "beta2", amount: 30, at: T0 + 5 * HOUR },
      { team: "beta", user: "alpha1", amount: 40, at: T0 + 3 * HOUR },
    ];
    for (const iv of invests) {
      const res = await investCore(prisma, userIds[iv.user], ideaIds[iv.team], iv.amount);
      if (!res.ok) throw new Error(`investCore شکست خورد: ${res.error}`);
      // زمان واقعی رویداد را برای آزمودن سطل‌های زمانی بازنویسی می‌کنیم (investCore خودش now() می‌زند)
      const last = await prisma.investment.findFirst({
        where: { userId: userIds[iv.user], ideaId: ideaIds[iv.team] },
        orderBy: { createdAt: "desc" },
      });
      if (last) await prisma.investment.update({ where: { id: last.id }, data: { createdAt: new Date(iv.at) } });
    }

    const buy = async (teamKey: string, userKey: string, amount: number, at: number) => {
      await prisma.purchase.create({
        data: { productId: productIds[teamKey], userId: userIds[userKey], amount, createdAt: new Date(at) },
      });
      await prisma.user.update({ where: { id: userIds[userKey] }, data: { buyWallet: { decrement: amount } } });
      await prisma.ledgerEntry.create({
        data: { userId: userIds[userKey], teamId: teamIds[teamKey], wallet: "BUY", delta: -amount, reason: "PURCHASE" },
      });
    };
    await buy("alpha", "beta1", 25, T0 + 8 * HOUR);
    await buy("alpha", "beta2", 15, T0 + 20 * HOUR);
    await buy("beta", "alpha1", 20, T0 + 12 * HOUR);
    await buy("beta", "alpha2", 10, T0 + 30 * HOUR);

    // ---------- آیتم ۴۸: سری‌های زمانی ----------
    const timeline = await loadTimeline();
    check("bucketEndsAt غیرخالی است", timeline.bucketEndsAt.length > 0, `=${timeline.bucketEndsAt.length}`);
    check(
      "تعداد سطل‌ها بین ۲۴ و ۴۸ است",
      timeline.bucketEndsAt.length >= 24 && timeline.bucketEndsAt.length <= 48,
      `=${timeline.bucketEndsAt.length}`
    );
    check("سری هر دو تیم موجود است", timeline.series.length === 2, `=${timeline.series.length}`);

    const totalSalesByTeam = { alpha: 25 + 15, beta: 20 + 10 };
    const totalCapitalByTeam = { alpha: 50 + 30, beta: 40 };

    for (const key of ["alpha", "beta"] as const) {
      const s = timeline.series.find((x) => x.teamId === teamIds[key]);
      if (!s) {
        check(`سری تیم ${key} پیدا شد`, false);
        continue;
      }
      const salesMonotonic = s.sales.every((v, i) => i === 0 || v >= s.sales[i - 1]);
      const capitalMonotonic = s.capital.every((v, i) => i === 0 || v >= s.capital[i - 1]);
      check(`سری فروش ${key} صعودی/ثابت است (تجمعی)`, salesMonotonic);
      check(`سری سرمایهٔ ${key} صعودی/ثابت است (تجمعی)`, capitalMonotonic);
      check(
        `مقدار پایانی فروش ${key} با مجموع کل برابر است`,
        s.sales[s.sales.length - 1] === totalSalesByTeam[key],
        `=${s.sales[s.sales.length - 1]} انتظار=${totalSalesByTeam[key]}`
      );
      check(
        `مقدار پایانی سرمایهٔ ${key} با مجموع کل برابر است`,
        s.capital[s.capital.length - 1] === totalCapitalByTeam[key],
        `=${s.capital[s.capital.length - 1]} انتظار=${totalCapitalByTeam[key]}`
      );
    }

    // ---------- تسویه (برای اینکه شیت Teams and scores مقدار داشته باشد) ----------
    await setPhase("CLOSED", null);
    const settled = await settleGame();
    check("تسویه انجام شد", settled.alreadySettled === false, String(settled.alreadySettled));

    // ---------- آیتم ۴۹ب: خروجی اکسل کامل ----------
    const buffer = await buildExportWorkbookBuffer();
    check("بافر اکسل ساخته شد و خالی نیست", buffer.length > 0, `=${buffer.length} bytes`);

    const wb = new ExcelJS.Workbook();
    // نوع Buffer سفارشی exceljs با Buffer<ArrayBufferLike> جدید @types/node یکی نیست؛ فقط در مرز cast می‌شود.
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);

    const expectedSheets = ["Teams and scores", "Users", "Ideas", "Investments", "Purchases", "Bids", "Ledger"];
    const actualSheets = wb.worksheets.map((ws) => ws.name);
    check(
      "همهٔ شیت‌های انتظاری وجود دارند",
      expectedSheets.every((n) => actualSheets.includes(n)),
      actualSheets.join(", ")
    );

    const wsTeams = wb.getWorksheet("Teams and scores")!;
    check("شیت Teams and scores دو ردیف داده دارد (+هدر)", wsTeams.rowCount === 3, `=${wsTeams.rowCount}`);

    const wsUsers = wb.getWorksheet("Users")!;
    check("شیت Users چهار ردیف داده دارد (+هدر)", wsUsers.rowCount === 5, `=${wsUsers.rowCount}`);

    const wsInv = wb.getWorksheet("Investments")!;
    check("شیت Investments سه ردیف داده دارد (+هدر)", wsInv.rowCount === 4, `=${wsInv.rowCount}`);

    const wsPur = wb.getWorksheet("Purchases")!;
    check("شیت Purchases چهار ردیف داده دارد (+هدر)", wsPur.rowCount === 5, `=${wsPur.rowCount}`);

    // ---------- هیچ ستون/مقدار passwordHash در شیت Users نیست ----------
    const headerValues = (wsUsers.getRow(1).values as unknown[]).map((v) => String(v ?? "").toLowerCase());
    check("هیچ هدری شامل passwordHash نیست", !headerValues.some((h) => h.includes("password")), headerValues.join("|"));

    let leaked = false;
    wsUsers.eachRow((row) => {
      row.eachCell((cell) => {
        if (String(cell.value ?? "").includes("SHOULD-NOT-LEAK")) leaked = true;
      });
    });
    check("مقدار passwordHash در هیچ سلولی درز نکرده", !leaked);

    // بررسی اینکه در کل فایل (همهٔ شیت‌ها) رشتهٔ رمز درز نکرده باشد
    let leakedAnywhere = false;
    for (const ws of wb.worksheets) {
      ws.eachRow((row) => {
        row.eachCell((cell) => {
          if (String(cell.value ?? "").includes("SHOULD-NOT-LEAK")) leakedAnywhere = true;
        });
      });
    }
    check("رمز عبور در هیچ شیتی درز نکرده", !leakedAnywhere);
  } catch (err) {
    console.error(err);
    check("اجرای بدون خطا", false, String(err));
  } finally {
    const { prisma: p } = await import("../src/lib/db");
    await p.$disconnect();
    cleanTempFiles();
  }

  const failed = checks.filter((c) => !c.ok);
  console.log("");
  console.log(`نتیجه: ${checks.length - failed.length}/${checks.length} — ${failed.length === 0 ? "PASS" : "FAIL"}`);
  if (failed.length > 0) {
    for (const f of failed) console.log(`  ✗ ${f.name} ${f.detail}`);
    process.exitCode = 1;
  }
}

void main();
