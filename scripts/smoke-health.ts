/**
 * دود-تست لاگ ساختاریافته (src/lib/log.ts)، هشدار throttle‌شده (src/lib/alert.ts) و
 * مسیر /api/health (src/app/api/health/route.ts).
 * اجرا: npx tsx scripts/smoke-health.ts
 *
 * پایگاه‌دادهٔ موقت با همان کمکی مشترک بقیهٔ دود-تست‌ها (scripts/lib/temp-db.ts) ساخته
 * و در پایان پاک می‌شود؛ هرگز dev.db واقعی را لمس نمی‌کند.
 */
import { createTempDb } from "./lib/temp-db";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}${extra === undefined ? "" : ` — ${JSON.stringify(extra)}`}`);
  }
}

/**
 * خواندن/نوشتن env بدون نشت بین بخش‌های تست؛ کلیدهای نامرتبط دست‌نخورده می‌مانند.
 * `fn` ممکن است async باشد — env تا resolve شدن کامل آن دست‌نخورده می‌ماند (وگرنه finally
 * زودتر از ادامهٔ بدنهٔ async اجرا و env را زودهنگام برمی‌گرداند).
 */
async function withEnv<T>(vars: Record<string, string | undefined>, fn: () => Promise<T>): Promise<T> {
  const prev: Record<string, string | undefined> = {};
  for (const k of Object.keys(vars)) prev[k] = process.env[k];
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

// ---------------------------------------------------------------------------
// بخش ۱: src/lib/log.ts — شکل خط JSON
// ---------------------------------------------------------------------------
async function testLog() {
  console.log("لاگ ساختاریافته (log.ts)");
  const { log } = await import("../src/lib/log");

  function captureStdout(fn: () => void): string[] {
    const lines: string[] = [];
    const orig = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: unknown, ...rest: unknown[]) => {
      lines.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;
    try {
      fn();
    } finally {
      process.stdout.write = orig;
    }
    return lines;
  }

  function captureStderr(fn: () => void): string[] {
    const lines: string[] = [];
    const orig = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((chunk: unknown, ...rest: unknown[]) => {
      lines.push(String(chunk));
      return true;
    }) as typeof process.stderr.write;
    try {
      fn();
    } finally {
      process.stderr.write = orig;
    }
    return lines;
  }

  const infoLines = captureStdout(() => log.info("test_event", { foo: "bar", n: 1 }));
  check("log.info یک خط چاپ می‌کند", infoLines.length === 1, infoLines.length);
  const infoParsed = JSON.parse(infoLines[0]);
  check("سطح info درست است", infoParsed.level === "info");
  check("event درست است", infoParsed.event === "test_event");
  check("ts یک تاریخ ISO معتبر است", !Number.isNaN(Date.parse(infoParsed.ts)), infoParsed.ts);
  check("فیلدهای اضافی حفظ می‌شوند", infoParsed.foo === "bar" && infoParsed.n === 1);

  // console.warn هم مثل console.error روی stderr می‌نویسد (رفتار پیش‌فرض Node).
  const warnLines = captureStderr(() => log.warn("warn_event"));
  const warnParsed = JSON.parse(warnLines[0]);
  check("سطح warn درست است", warnParsed.level === "warn");

  const errLines = captureStderr(() => log.error("err_event", { error: new Error("boom") }));
  check("log.error روی stderr چاپ می‌کند", errLines.length === 1, errLines.length);
  const errParsed = JSON.parse(errLines[0]);
  check("سطح error درست است", errParsed.level === "error");
  check("خطا به message/stack سریالایز می‌شود", errParsed.error?.message === "boom" && typeof errParsed.error?.stack === "string", errParsed.error);
}

// ---------------------------------------------------------------------------
// بخش ۲: src/lib/alert.ts — throttle، عدم throw، no-op بدون تنظیم، و ارسال واقعی (fetch جعلی)
// ---------------------------------------------------------------------------
async function testAlert() {
  console.log("هشدار throttle‌شده (alert.ts)");
  const { alert, setAlertFetch, resetAlertFetch } = await import("../src/lib/alert");

  type Call = { url: string; body: { key?: string; message?: string; [k: string]: unknown } | undefined };
  function fakeFetch(calls: Call[], opts?: { throw?: boolean }) {
    return (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (opts?.throw) throw new Error("network down");
      calls.push({ url: String(input), body: init?.body ? JSON.parse(String(init.body)) : undefined });
      return new Response("ok", { status: 200 });
    }) as typeof fetch;
  }

  // --- no-op وقتی هیچ‌چیز تنظیم نشده ---
  await withEnv({ ALERT_WEBHOOK_URL: undefined, TELEGRAM_BOT_TOKEN: undefined, TELEGRAM_CHAT_ID: undefined }, async () => {
    const calls: Call[] = [];
    setAlertFetch(fakeFetch(calls));
    await alert("noop-key", "پیامی که هرگز نباید ارسال شود");
    check("بدون تنظیم هیچ env: هیچ fetch‌ای اجرا نشد", calls.length === 0, calls.length);
  });

  // --- وب‌هوک عمومی: ارسال + throttle روی کلید تکراری ---
  await withEnv({ ALERT_WEBHOOK_URL: "https://example.invalid/hook", TELEGRAM_BOT_TOKEN: undefined, TELEGRAM_CHAT_ID: undefined }, async () => {
    const calls: Call[] = [];
    setAlertFetch(fakeFetch(calls));
    await alert("webhook-key", "پیام اول", { n: 1 });
    check("وب‌هوک: اولین هشدار ارسال شد", calls.length === 1, calls.length);
    check("وب‌هوک: بدنه شامل key/message است", calls[0]?.body?.key === "webhook-key" && calls[0]?.body?.message === "پیام اول", calls[0]?.body);

    await alert("webhook-key", "پیام دوم (باید throttle شود)");
    check("وب‌هوک: هشدار دوم با همان کلید ظرف ۵ دقیقه throttle شد", calls.length === 1, calls.length);

    await alert("webhook-key-2", "کلید متفاوت — نباید throttle شود");
    check("وب‌هوک: کلید متفاوت throttle نمی‌شود", calls.length === 2, calls.length);
  });

  // --- تلگرام: URL شامل توکن/چت و TELEGRAM_API_BASE قابل تنظیم است ---
  await withEnv(
    { ALERT_WEBHOOK_URL: undefined, TELEGRAM_BOT_TOKEN: "TOKEN123", TELEGRAM_CHAT_ID: "CHAT1", TELEGRAM_API_BASE: "https://proxy.example.invalid" },
    async () => {
      const calls: Call[] = [];
      setAlertFetch(fakeFetch(calls));
      await alert("telegram-key", "پیام تلگرام");
      check("تلگرام: یک درخواست ارسال شد", calls.length === 1, calls.length);
      check("تلگرام: از TELEGRAM_API_BASE سفارشی استفاده شد", calls[0]?.url.startsWith("https://proxy.example.invalid/botTOKEN123/sendMessage"), calls[0]?.url);
    }
  );

  // --- هرگز throw نمی‌کند، حتی اگر sender خطا بدهد ---
  await withEnv({ ALERT_WEBHOOK_URL: "https://example.invalid/hook", TELEGRAM_BOT_TOKEN: undefined, TELEGRAM_CHAT_ID: undefined }, async () => {
    const calls: Call[] = [];
    setAlertFetch(fakeFetch(calls, { throw: true }));
    let threw = false;
    try {
      await alert("throwing-key", "پیامی که sender برایش خطا می‌دهد");
    } catch {
      threw = true;
    }
    check("alert() حتی وقتی fetch خطا می‌دهد throw نمی‌کند", !threw);
  });

  resetAlertFetch();
}

// ---------------------------------------------------------------------------
// بخش ۳: /api/health — مستقیماً GET را روی یک دیتابیس موقت صدا می‌زند
// ---------------------------------------------------------------------------
async function testHealth() {
  console.log("مسیر /api/health");

  // createTempDb خودش migrate deploy را اجرا و DATABASE_URL را تنظیم می‌کند.
  const tempDb = createTempDb("smoke-health");
  process.env.SCHEDULER_DISABLED = "1";

  try {
    // باید بعد از تنظیم DATABASE_URL ایمپورت شوند (prisma آدرس را فقط یک‌بار می‌خواند).
    const { GET } = await import("../src/app/api/health/route");
    const { prisma } = await import("../src/lib/db");

    const res = await GET();
    check("وضعیت ۲۰۰ برای سالم", res.status === 200, res.status);
    check("Cache-Control: no-store", res.headers.get("cache-control") === "no-store", res.headers.get("cache-control"));

    const body = await res.json();
    check("ok=true", body.ok === true, body);
    check("db.ok=true و ms عدد است", body.db?.ok === true && typeof body.db?.ms === "number", body.db);
    check("scheduler خروجی دارد (اسکجولر غیرفعال بود)", body.scheduler?.disabled === true, body.scheduler);
    check("uptime عدد است", typeof body.uptime === "number", body.uptime);
    check("version رشته است", typeof body.version === "string", body.version);
    check("هیچ env/رازی در پاسخ نیست", JSON.stringify(body).toLowerCase().indexOf("secret") === -1 && JSON.stringify(body).indexOf(tempDb.url) === -1);

    // شبیه‌سازی ناسالمی: $queryRawUnsafe را موقتاً خراب می‌کنیم (قطع واقعی اتصال روی
    // ویندوز/better-sqlite3 قابل اتکا نیست چون فایل باز را نمی‌شود حذف کرد و $disconnect
    // خطا نمی‌دهد)، سپس دوباره GET را صدا می‌زنیم.
    const origQuery = prisma.$queryRawUnsafe.bind(prisma);
    prisma.$queryRawUnsafe = (() => Promise.reject(new Error("simulated db down"))) as typeof prisma.$queryRawUnsafe;
    try {
      const res2 = await GET();
      const body2 = await res2.json();
      check("وقتی دیتابیس در دسترس نیست: ok=false و status=503", body2.ok === false && res2.status === 503, { status: res2.status, body: body2 });
      check("وقتی دیتابیس در دسترس نیست: db.ok=false", body2.db?.ok === false, body2.db);
    } finally {
      prisma.$queryRawUnsafe = origQuery;
    }
  } finally {
    tempDb.cleanup();
  }
}

async function main() {
  await testLog();
  await testAlert();
  await testHealth();

  console.log("");
  console.log(`نتیجه: ${pass} PASS · ${fail} FAIL`);
  console.log(fail === 0 ? "SMOKE: PASS" : "SMOKE: FAIL");
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("SMOKE: FAIL — خطای غیرمنتظره");
  console.error(e);
  process.exit(1);
});
