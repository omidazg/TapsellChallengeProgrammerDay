/**
 * اجراکنندهٔ همهٔ دود-تست‌ها (scripts/smoke-*.ts).
 * اجرا: npm run smoke   (یا: npx tsx scripts/run-smokes.ts [--parallel N])
 *
 * هر اسکریپت smoke-*.ts در scripts/ به‌صورت خودکار پیدا می‌شود (glob ساده روی نام
 * فایل)، پس اسکریپت‌های تازه‌ای که دیگر ایجنت‌ها اضافه می‌کنند بدون هیچ تغییری در
 * این فایل شناسایی می‌شوند. هر اسکریپت در یک زیرفرایند جدا و با پایگاه‌دادهٔ موقت
 * مخصوص به خودش اجرا می‌شود (createTempDb از scripts/lib/temp-db.ts)، تا هرگز به
 * dev.db واقعی دست نخورد و اسکریپت‌ها با هم تداخل نکنند.
 *
 * پیش‌فرض: اجرای ترتیبی (یکی‌یکی). با `--parallel N` تا N اسکریپت هم‌زمان اجرا می‌شوند.
 * اسکریپت‌هایی که خودشان روی یک کپی از dev.db یا پایگاه‌دادهٔ موقت مخصوص خودشان کار
 * می‌کنند (مثل smoke-auction/smoke-scoring/smoke-settlement) مقدار DATABASE_URL
 * دریافتی از این اجراکننده را نادیده می‌گیرند یا خودشان override می‌کنند؛ بی‌خطر است.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createTempDb, type TempDb } from "./lib/temp-db";

const ROOT = path.resolve(__dirname, "..");
const SCRIPTS_DIR = __dirname;

function parseArgs(argv: string[]) {
  let parallel = 1;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--parallel") {
      const n = parseInt(argv[i + 1] ?? "", 10);
      if (Number.isFinite(n) && n > 0) parallel = n;
      i++;
    } else if (argv[i].startsWith("--parallel=")) {
      const n = parseInt(argv[i].split("=")[1] ?? "", 10);
      if (Number.isFinite(n) && n > 0) parallel = n;
    }
  }
  return { parallel };
}

function findSmokeScripts(): string[] {
  return fs
    .readdirSync(SCRIPTS_DIR)
    .filter((f) => f.startsWith("smoke-") && f.endsWith(".ts"))
    .sort()
    .map((f) => path.join(SCRIPTS_DIR, f));
}

type RunResult = {
  name: string;
  ok: boolean;
  durationMs: number;
  code: number | null;
  output: string;
};

function runOne(scriptPath: string): Promise<RunResult> {
  const name = path.basename(scriptPath);
  const label = name.replace(/^smoke-/, "").replace(/\.ts$/, "");
  let tempDb: TempDb | null = null;
  const start = Date.now();

  return new Promise((resolve) => {
    let env = process.env;
    try {
      tempDb = createTempDb(`runner-${label}`);
      env = { ...process.env, DATABASE_URL: tempDb.url };
    } catch (e) {
      // اگر ساخت پایگاه‌دادهٔ موقت شکست بخورد، همچنان اسکریپت را اجرا می‌کنیم
      // (اسکریپت‌هایی مثل smoke-sse/smoke-upload اصلاً دیتابیس لازم ندارند)؛
      // شکست واقعی خودش در خروجی آن اسکریپت ظاهر می‌شود.
      console.error(`  [هشدار] ساخت پایگاه‌دادهٔ موقت برای ${name} شکست خورد: ${(e as Error).message}`);
    }

    // shell:true چون در ویندوز npx یک اسکریپت .cmd است و spawn مستقیم آن بدون
    // شل با EINVAL شکست می‌خورد؛ روی POSIX هم بی‌خطر است.
    const child = spawn("npx", ["tsx", scriptPath], {
      cwd: ROOT,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      shell: true,
    });

    let output = "";
    child.stdout.on("data", (d) => (output += d.toString()));
    child.stderr.on("data", (d) => (output += d.toString()));

    child.on("close", (code) => {
      tempDb?.cleanup();
      resolve({
        name,
        ok: code === 0,
        durationMs: Date.now() - start,
        code,
        output,
      });
    });

    child.on("error", (err) => {
      tempDb?.cleanup();
      output += `\n${err.stack ?? err.message}`;
      resolve({ name, ok: false, durationMs: Date.now() - start, code: null, output });
    });
  });
}

async function runPool(scripts: string[], parallel: number): Promise<RunResult[]> {
  const results: RunResult[] = [];
  let i = 0;
  async function worker() {
    while (i < scripts.length) {
      const idx = i++;
      const script = scripts[idx];
      console.log(`▶ شروع  ${path.basename(script)}`);
      const res = await runOne(script);
      results[idx] = res;
      console.log(`${res.ok ? "✔ موفق " : "✘ ناموفق"}  ${res.name}  (${(res.durationMs / 1000).toFixed(1)}s)`);
    }
  }
  const workers = Array.from({ length: Math.min(parallel, scripts.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

function printSummary(results: RunResult[]) {
  const nameWidth = Math.max(10, ...results.map((r) => r.name.length));
  console.log("\n" + "=".repeat(nameWidth + 30));
  console.log("خلاصهٔ دود-تست‌ها");
  console.log("=".repeat(nameWidth + 30));
  for (const r of results) {
    const status = r.ok ? "PASS" : "FAIL";
    const dur = `${(r.durationMs / 1000).toFixed(1)}s`.padStart(7);
    console.log(`${status.padEnd(5)} ${r.name.padEnd(nameWidth)} ${dur}`);
  }
  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  console.log("-".repeat(nameWidth + 30));
  console.log(`${passed} موفق، ${failed} ناموفق، از ${results.length} اسکریپت`);

  if (failed > 0) {
    console.log("\n----- خروجی اسکریپت‌های ناموفق -----");
    for (const r of results.filter((r) => !r.ok)) {
      console.log(`\n### ${r.name} (exit code ${r.code})`);
      console.log(r.output.trim());
    }
  }
}

async function main() {
  const { parallel } = parseArgs(process.argv.slice(2));
  const scripts = findSmokeScripts();
  if (scripts.length === 0) {
    console.log("هیچ اسکریپت smoke-*.ts پیدا نشد.");
    process.exit(1);
  }
  console.log(`${scripts.length} دود-تست پیدا شد (parallel=${parallel}):`);
  for (const s of scripts) console.log(`  - ${path.basename(s)}`);
  console.log("");

  const results = await runPool(scripts, parallel);
  printSummary(results);

  process.exit(results.every((r) => r.ok) ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
