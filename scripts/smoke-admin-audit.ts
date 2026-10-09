/**
 * دود-تست پایپ‌لاین تنظیمات ادمین (src/lib/settings-schema.ts) و ثبت گزارش (src/lib/audit.ts).
 *
 * فقط بخش‌های خالص کتابخانه را می‌آزماید، نه سرور-اکشن‌ها (که به کوکی/نشست نیاز دارند).
 *
 * اجرا: npx tsx scripts/smoke-admin-audit.ts
 * اگر DATABASE_URL از قبل به یک پایگاه‌دادهٔ موقت اشاره نکند (اجرای مستقل)، خود اسکریپت با
 * createTempDb یکی می‌سازد؛ پایگاه‌دادهٔ اصلی هرگز لمس نمی‌شود.
 */

import { createTempDb, isTempDatabaseUrl } from "./lib/temp-db";

// DATABASE_URL باید پیش از import شدن src/lib/db (که lib/admin آن را می‌کشد) تنظیم شود.
const ownTempDb = isTempDatabaseUrl(process.env.DATABASE_URL) ? null : createTempDb("admin-audit");

let passed = 0;
let failed = 0;

function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++;
    console.log(`PASS  ${label}`);
  } else {
    failed++;
    console.log(`FAIL  ${label}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
  }
}

function eq(label: string, actual: unknown, expected: unknown) {
  check(label, Object.is(actual, expected), { actual, expected });
}

function formDataOf(values: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(values)) fd.set(k, v);
  return fd;
}

async function main() {
  const {
    parseGameSettings,
    parseSchedulerSettings,
    saveSettings,
    gameSettingsSchema,
    schedulerSettingsSchema,
  } = await import("../src/lib/settings-schema");
  const { SETTING_KEYS, SCHEDULER_SETTING_KEYS } = await import("../src/lib/admin");
  const { audit } = await import("../src/lib/audit");
  const { prisma } = await import("../src/lib/db");

  try {
    // ---------- کلیدهای اسکیمای مشترک باید دقیقاً با کلیدهای قدیمی یکی باشند ----------
    eq(
      "کلیدهای gameSettingsSchema با SETTING_KEYS یکی است",
      JSON.stringify(Object.keys(gameSettingsSchema.shape).sort()),
      JSON.stringify([...SETTING_KEYS].sort())
    );
    eq(
      "کلیدهای schedulerSettingsSchema با SCHEDULER_SETTING_KEYS یکی است",
      JSON.stringify(Object.keys(schedulerSettingsSchema.shape).sort()),
      JSON.stringify([...SCHEDULER_SETTING_KEYS].sort())
    );

    // ---------- تنظیمات بازی: ورودی معتبر ----------
    const baseGame: Record<string, string> = {
      starting_coins: "200",
      support_cap: "50",
      max_bought_coins_per_user: "1000",
      bid_increment: "2",
      auction_duration_sec: "300",
      adslot_price_banner: "60",
      adslot_price_featured: "40",
      adslot_price_push: "80",
      adslot_max_per_team: "2",
      market_starts_at: "",
    };
    eq("فرم آزمون همهٔ کلیدهای SETTING_KEYS را دارد", JSON.stringify(Object.keys(baseGame).sort()), JSON.stringify([...SETTING_KEYS].sort()));
    const parsedGame = parseGameSettings(formDataOf(baseGame));
    check("تنظیمات بازی معتبر: بدون خطا", parsedGame.ok, parsedGame);
    if (parsedGame.ok) {
      eq("starting_coins به عدد تبدیل شد", parsedGame.data.starting_coins, 200);
      eq("support_cap به عدد تبدیل شد", parsedGame.data.support_cap, 50);
      eq("market_starts_at خالی مجاز است", parsedGame.data.market_starts_at, "");
    }
    const withDate = parseGameSettings(formDataOf({ ...baseGame, market_starts_at: "2026-10-10T12:00" }));
    check("تنظیمات بازی: زمان شروع بازار معتبر پذیرفته می‌شود", withDate.ok, withDate);

    // ---------- تنظیمات بازی: ورودی‌های نامعتبر ----------
    const rejectCases: [string, Record<string, string>][] = [
      ["فیلد خالی (auction_duration_sec) رد می‌شود", { ...baseGame, auction_duration_sec: "" }],
      ["مدت حراج کمتر از حداقل (۱۰) رد می‌شود", { ...baseGame, auction_duration_sec: "5" }],
      ["زمان شروع بازار نامعتبر رد می‌شود", { ...baseGame, market_starts_at: "not-a-date" }],
      ["سقف اثر حمایت صفر رد می‌شود", { ...baseGame, support_cap: "0" }],
      ["سکهٔ اولیهٔ منفی رد می‌شود", { ...baseGame, starting_coins: "-1" }],
      ["سکهٔ اولیهٔ اعشاری رد می‌شود", { ...baseGame, starting_coins: "1.5" }],
      ["قیمت جایگاه صفر رد می‌شود", { ...baseGame, adslot_price_banner: "0" }],
    ];
    for (const [label, values] of rejectCases) {
      const r = parseGameSettings(formDataOf(values));
      check(`تنظیمات بازی: ${label}`, !r.ok, r);
    }
    const missingKey = { ...baseGame };
    delete missingKey.bid_increment;
    check("تنظیمات بازی: کلید غایب رد می‌شود", !parseGameSettings(formDataOf(missingKey)).ok);

    // ---------- تنظیمات زمان‌بند: ورودی معتبر، شامل چک‌باکس غایب ----------
    const validScheduler = formDataOf({
      auto_advance: "1",
      // auto_auction عمداً غایب است ← باید "0" شود
      auction_gap_sec: "60.9", // باید truncate شود به ۶۰
      phase_hours_IDEATION: "24",
      phase_hours_SEED_ROUND: "24",
      phase_hours_BUILD: "48",
      phase_hours_MARKET: "6",
    });
    const parsedScheduler = parseSchedulerSettings(validScheduler);
    check("تنظیمات زمان‌بند معتبر: بدون خطا", parsedScheduler.ok, parsedScheduler);
    if (parsedScheduler.ok) {
      eq("چک‌باکس غایب auto_auction به 0 تبدیل شد", parsedScheduler.data.auto_auction, "0");
      eq("مقدار اعشاری auction_gap_sec truncate شد", parsedScheduler.data.auction_gap_sec, 60);
    }

    // ---------- تنظیمات زمان‌بند: عدد منفی رد می‌شود ----------
    const negativeScheduler = formDataOf({
      auto_advance: "0",
      auto_auction: "0",
      auction_gap_sec: "-5",
      phase_hours_IDEATION: "24",
      phase_hours_SEED_ROUND: "24",
      phase_hours_BUILD: "48",
      phase_hours_MARKET: "6",
    });
    const parsedNegative = parseSchedulerSettings(negativeScheduler);
    check("تنظیمات زمان‌بند: عدد منفی رد می‌شود", !parsedNegative.ok, parsedNegative);

    // ---------- ذخیره: saveSettings واقعاً روی جدول Setting می‌نویسد ----------
    if (parsedGame.ok) {
      const after = await saveSettings(parsedGame.data, async (key, value) => {
        await prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
      });
      const row = await prisma.setting.findUnique({ where: { key: "starting_coins" } });
      eq("saveSettings مقدار starting_coins را در جدول Setting نوشت", row?.value, "200");
      eq("خروجی saveSettings مقدار بعد از ذخیره را برمی‌گرداند", after.starting_coins, "200");
      eq("saveSettings همهٔ کلیدها را نوشت", await prisma.setting.count({ where: { key: { in: [...SETTING_KEYS] } } }), SETTING_KEYS.length);
      const { getSettingsMap } = await import("../src/lib/admin");
      eq("getSettingsMap مقدار ذخیره‌شده را برمی‌گرداند", (await getSettingsMap()).support_cap, "50");
    }

    // ---------- audit(): ثبت موفق یک ردیف ----------
    const user = await prisma.user.create({
      data: {
        email: "audit-smoke@example.com",
        passwordHash: "x",
        nickname: "دود-تست",
        role: "BUILDER",
        power: "",
      },
    });
    const beforeCount = await prisma.auditLog.count();
    await audit(user.id, "phase.set", "MARKET", { from: "BUILD", to: "MARKET" });
    const afterCount = await prisma.auditLog.count();
    eq("audit() یک ردیف جدید ثبت کرد", afterCount, beforeCount + 1);

    const row = await prisma.auditLog.findFirst({ where: { action: "phase.set" }, orderBy: { createdAt: "desc" } });
    check("ردیف ثبت‌شده actorId درستی دارد", row?.actorId === user.id, row?.actorId);
    check("ردیف ثبت‌شده detail به‌صورت JSON قابل‌خواندن است", (() => {
      try {
        const parsed = JSON.parse(row?.detail ?? "");
        return parsed.from === "BUILD" && parsed.to === "MARKET";
      } catch {
        return false;
      }
    })(), row?.detail);

    // ---------- audit(): با actorId نامعتبر (نقض کلید خارجی) هرگز پرتاب نمی‌کند ----------
    let threw = false;
    try {
      await audit("this-user-does-not-exist", "phase.set", "", {});
    } catch {
      threw = true;
    }
    check("audit() با actorId نامعتبر پرتاب نمی‌کند", !threw);

    // ---------- audit(): با detail حلقوی (غیرقابل JSON.stringify) هم پرتاب نمی‌کند ----------
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    let threwCircular = false;
    try {
      await audit(user.id, "phase.set", "", circular);
    } catch {
      threwCircular = true;
    }
    check("audit() با detail حلقوی پرتاب نمی‌کند", !threwCircular);

    // ---------- audit(): actorId=null هم مجاز است ----------
    let threwNull = false;
    try {
      await audit(null, "settlement.run", "", { teams: 3 });
    } catch {
      threwNull = true;
    }
    check("audit() با actorId=null پرتاب نمی‌کند", !threwNull);
  } finally {
    try {
      await prisma.$disconnect();
    } catch {
      /* پاکسازی بهترین‌تلاش */
    }
    ownTempDb?.cleanup();
  }

  console.log("");
  console.log(`نتیجه: ${passed} PASS · ${failed} FAIL`);
  console.log(failed === 0 ? "SMOKE: PASS" : "SMOKE: FAIL");
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("SMOKE: FAIL — خطای غیرمنتظره");
  console.error(e);
  ownTempDb?.cleanup();
  process.exit(1);
});
