/**
 * دود-تست پایپ‌لاین تنظیمات ادمین (src/lib/settings-schema.ts) و ثبت گزارش (src/lib/audit.ts).
 *
 * فقط بخش‌های خالص کتابخانه را می‌آزماید، نه سرور-اکشن‌ها (که به کوکی/نشست نیاز دارند).
 *
 * اجرا (پایگاه‌دادهٔ موقت، بدون دست‌زدن به dev.db واقعی):
 *   DATABASE_URL="file:<tmp>.db" npx prisma migrate deploy
 *   DATABASE_URL="file:<tmp>.db" npx tsx scripts/smoke-admin-audit.ts
 *
 * (این اسکریپت خودش migrate deploy را اجرا نمی‌کند؛ فرض می‌کند DATABASE_URL از قبل
 * به یک پایگاه‌دادهٔ SQLite با اسکیمای اعمال‌شده اشاره می‌کند — مطابق قرارداد بقیهٔ
 * اسکریپت‌های scripts/smoke-*.ts در این پروژه.)
 */

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
  if (!process.env.DATABASE_URL) {
    console.log("FAIL  DATABASE_URL تنظیم نشده؛ به یک فایل موقت اشاره بده (پایگاه‌دادهٔ اصلی را لمس نکن).");
    process.exit(1);
  }

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
    const validGame = formDataOf({
      seed_wallet: "100",
      buy_wallet: "100",
      max_per_target: "40",
      penalty_per_coin: "1.5",
      bid_increment: "2",
      auction_duration_sec: "300",
      market_starts_at: "",
    });
    const parsedGame = parseGameSettings(validGame);
    check("تنظیمات بازی معتبر: بدون خطا", parsedGame.ok, parsedGame);
    if (parsedGame.ok) {
      eq("penalty_per_coin غیرصحیح مجاز است (۱.۵)", parsedGame.data.penalty_per_coin, 1.5);
      eq("market_starts_at خالی مجاز است", parsedGame.data.market_starts_at, "");
    }

    // ---------- تنظیمات بازی: ورودی نامعتبر (فیلد خالی) ----------
    const missingGame = formDataOf({
      seed_wallet: "100",
      buy_wallet: "100",
      max_per_target: "40",
      penalty_per_coin: "1",
      bid_increment: "2",
      auction_duration_sec: "", // خالی → باید رد شود
      market_starts_at: "",
    });
    const parsedMissing = parseGameSettings(missingGame);
    check("تنظیمات بازی: فیلد خالی رد می‌شود", !parsedMissing.ok, parsedMissing);

    // ---------- تنظیمات بازی: ورودی نامعتبر (کمتر از حداقل) ----------
    const tooShort = formDataOf({
      seed_wallet: "100",
      buy_wallet: "100",
      max_per_target: "40",
      penalty_per_coin: "1",
      bid_increment: "2",
      auction_duration_sec: "5", // کمتر از حداقل ۱۰
      market_starts_at: "",
    });
    const parsedShort = parseGameSettings(tooShort);
    check("تنظیمات بازی: مدت حراج کمتر از حداقل رد می‌شود", !parsedShort.ok, parsedShort);

    // ---------- تنظیمات بازی: تاریخ نامعتبر ----------
    const badDate = formDataOf({
      seed_wallet: "100",
      buy_wallet: "100",
      max_per_target: "40",
      penalty_per_coin: "1",
      bid_increment: "2",
      auction_duration_sec: "300",
      market_starts_at: "not-a-date",
    });
    const parsedBadDate = parseGameSettings(badDate);
    check("تنظیمات بازی: زمان شروع بازار نامعتبر رد می‌شود", !parsedBadDate.ok, parsedBadDate);

    // ---------- تنظیمات زمان‌بند: ورودی معتبر، شامل چک‌باکس غایب ----------
    const validScheduler = formDataOf({
      auto_advance: "1",
      // auto_auction عمداً غایب است ← باید "0" شود
      auction_gap_sec: "60.9", // باید truncate شود به ۶۰
      phase_hours_IDEATION: "24",
      phase_hours_SEED_ROUND: "24",
      phase_hours_BUILD: "48",
      phase_hours_MARKET: "6",
      phase_hours_AUCTION: "2",
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
      phase_hours_AUCTION: "2",
    });
    const parsedNegative = parseSchedulerSettings(negativeScheduler);
    check("تنظیمات زمان‌بند: عدد منفی رد می‌شود", !parsedNegative.ok, parsedNegative);

    // ---------- ذخیره: saveSettings واقعاً روی جدول Setting می‌نویسد ----------
    if (parsedGame.ok) {
      const after = await saveSettings(parsedGame.data, async (key, value) => {
        await prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
      });
      const row = await prisma.setting.findUnique({ where: { key: "seed_wallet" } });
      eq("saveSettings مقدار seed_wallet را در جدول Setting نوشت", row?.value, "100");
      eq("خروجی saveSettings مقدار بعد از ذخیره را برمی‌گرداند", after.seed_wallet, "100");
    }

    // ---------- audit(): ثبت موفق یک ردیف ----------
    const user = await prisma.user.create({
      data: {
        email: "audit-smoke@example.com",
        passwordHash: "x",
        nickname: "دود-تست",
        role: "BUILDER",
        power: "HYPE",
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
  }

  console.log("");
  console.log(`نتیجه: ${passed} PASS · ${failed} FAIL`);
  console.log(failed === 0 ? "SMOKE: PASS" : "SMOKE: FAIL");
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("SMOKE: FAIL — خطای غیرمنتظره");
  console.error(e);
  process.exit(1);
});
