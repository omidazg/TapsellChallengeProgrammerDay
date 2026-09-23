/**
 * تست دودی بودجه/هزینه/کش هوش مصنوعی (src/lib/ai-budget.ts, ai.ts, analyst.ts).
 * اجرا: npx tsx scripts/smoke-ai.ts
 *
 * هرگز API واقعی Claude را صدا نمی‌زند؛ یک کلاینت جعلی با setTestClient تزریق می‌شود
 * که پاسخ و usage از پیش‌تعیین‌شده برمی‌گرداند. روی یک پایگاه‌دادهٔ SQLite موقت اجرا می‌شود.
 */

import type Anthropic from "@anthropic-ai/sdk";
import { createHash } from "node:crypto";
import { createTempDb, isTempDatabaseUrl } from "./lib/temp-db";

const ownTempDb = isTempDatabaseUrl(process.env.DATABASE_URL) ? null : createTempDb("ai");

let passed = 0;
let failed = 0;
function check(name: string, condition: boolean, detail?: unknown) {
  if (condition) {
    passed++;
    console.log(`PASS  ${name}`);
  } else {
    failed++;
    console.log(`FAIL  ${name}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
  }
}

type FakeUsage = {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
};

async function main() {
  // مدل مشخص و شناخته‌شده تا قیمت مورد انتظار دقیقاً قابل‌محاسبه باشد.
  process.env.ANTHROPIC_MODEL = "claude-sonnet-5"; // $2.00 / 1M ورودی، $10.00 / 1M خروجی
  process.env.AI_DAILY_BUDGET_USD = "10";
  process.env.AI_USER_DAILY_MESSAGES = "30";

  const { prisma } = await import("../src/lib/db");
  const { setTestClient, askText } = await import("../src/lib/ai");
  const { getUsage, checkDailyBudget, checkUserDailyMessageCap, normalizeQuestion } = await import("../src/lib/ai-budget");
  const { runAnalyst } = await import("../src/lib/analyst");
  const { cached } = await import("../src/lib/ttl-cache");

  let callCount = 0;

  function fakeClient(text: string, usage: FakeUsage): Anthropic {
    return {
      messages: {
        create: async () => {
          callCount++;
          return {
            id: "msg_fake",
            type: "message",
            role: "assistant",
            stop_reason: "end_turn",
            stop_sequence: null,
            content: [{ type: "text", text }],
            usage: {
              input_tokens: usage.input_tokens,
              output_tokens: usage.output_tokens,
              cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
              cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
            },
          };
        },
      },
    } as unknown as Anthropic;
  }

  const createdUserIds: string[] = [];
  const createdTeamIds: string[] = [];
  const createdIdeaIds: string[] = [];

  try {
    // ---------- ۱) هزینه به‌درستی انباشته می‌شود ----------
    callCount = 0;
    setTestClient(fakeClient("پاسخ آزمایشی", { input_tokens: 1000, output_tokens: 500 }));
    const before = await getUsage();
    const r1 = await askText("یک سیستم پرامپت آزمایشی", "سؤال یک", 100);
    check("askText با کلاینت جعلی پاسخ برمی‌گرداند", r1 === "پاسخ آزمایشی", r1);

    const after1 = await getUsage();
    const expectedCost = (1000 * 2.0 + 500 * 10.0) / 1_000_000;
    check(
      "هزینهٔ یک فراخوانی طبق جدول قیمت claude-sonnet-5 محاسبه شد",
      Math.abs(after1.costUsd - before.costUsd - expectedCost) < 1e-9,
      { before: before.costUsd, after: after1.costUsd, expectedCost }
    );
    check("calls یک واحد افزایش یافت", after1.calls === before.calls + 1, after1.calls);
    check(
      "inputTokens/outputTokens درست جمع شدند",
      after1.inputTokens === before.inputTokens + 1000 && after1.outputTokens === before.outputTokens + 500
    );

    await askText("s", "q2", 50);
    await askText("s", "q3", 50);
    const after3 = await getUsage();
    check("پس از سه فراخوانی calls به‌درستی جمع شده است", after3.calls === before.calls + 3, after3.calls);
    check("هزینه پس از سه فراخوانی از هزینهٔ یک فراخوانی بیشتر است", after3.costUsd > after1.costUsd);

    // ---------- ۲) پس از عبور از بودجهٔ روزانه، فراخوانی جدید مسدود می‌شود ----------
    process.env.AI_DAILY_BUDGET_USD = "0.0001"; // مصرف امروز که در بالا ثبت شد از این عدد بیشتر است
    const budgetStatus = await checkDailyBudget();
    check("checkDailyBudget می‌گوید بودجهٔ امروز پر شده", budgetStatus.ok === false, budgetStatus);

    const callsBeforeBlock = callCount;
    const blocked = await askText("s", "سؤال مسدودشده", 50);
    check("askText وقتی بودجه پر است null برمی‌گرداند (هرگز throw نمی‌کند)", blocked === null, blocked);
    check("askText وقتی بودجه پر است اصلاً کلاینت را صدا نمی‌زند", callCount === callsBeforeBlock, { callCount, callsBeforeBlock });
    process.env.AI_DAILY_BUDGET_USD = "10";

    // ---------- دادهٔ آزمایشی مشترک برای بخش‌های بعدی ----------
    const tag = `smoke_ai_${Date.now()}`;
    const team = await prisma.team.create({ data: { name: `${tag}_team`, slug: `${tag}-team` } });
    createdTeamIds.push(team.id);
    const user = await prisma.user.create({
      data: { email: `${tag}@example.test`, passwordHash: "x", nickname: "کاربر آزمایشی", role: "DEALMAKER", power: "HYPE", teamId: team.id },
    });
    createdUserIds.push(user.id);
    const idea = await prisma.idea.create({
      data: {
        teamId: team.id,
        title: "ایدهٔ آزمایشی",
        oneLiner: "یک‌خطی اولیه",
        problem: "مسئلهٔ اولیه",
        audience: "مخاطب",
        buildPlan: "برنامهٔ ساخت",
        fundingCap: 100,
        revenueShare: 30,
        submittedAt: new Date(),
      },
    });
    createdIdeaIds.push(idea.id);

    // ---------- ۳) سقف روزانهٔ پیام هر کاربر ----------
    process.env.AI_USER_DAILY_MESSAGES = "3";
    for (let i = 0; i < 3; i++) {
      await prisma.dueDiligenceMessage.create({ data: { ideaId: idea.id, userId: user.id, question: `سؤال ${i}`, answer: `پاسخ ${i}` } });
    }
    const capStatus = await checkUserDailyMessageCap(user.id);
    check("سقف روزانهٔ پیام کاربر پس از رسیدن به سقف رد می‌کند", capStatus.ok === false && capStatus.used === 3, capStatus);
    process.env.AI_USER_DAILY_MESSAGES = "30";
    const capStatusOk = await checkUserDailyMessageCap(user.id);
    check("با سقف بالاتر، همان کاربر دوباره مجاز است", capStatusOk.ok === true, capStatusOk);

    // ---------- ۴) کش تحلیل‌گر بر اساس هش محتوا ----------
    callCount = 0;
    setTestClient(fakeClient(JSON.stringify({ clarity: 80, feasibility: 70, novelty: 60, summary: "خلاصهٔ اول" }), { input_tokens: 200, output_tokens: 100 }));
    const a1 = await runAnalyst(idea.id);
    check("runAnalyst بار اول نتیجه می‌دهد", a1 !== null && a1.clarity === 80, a1);
    check("runAnalyst بار اول یک‌بار API را صدا زد", callCount === 1, callCount);

    const a2 = await runAnalyst(idea.id);
    check("runAnalyst برای محتوای بدون تغییر دوباره API را صدا نمی‌زند", callCount === 1, callCount);
    check("نتیجهٔ کش‌شده با نتیجهٔ اول یکسان است", a2 !== null && a2.clarity === a1?.clarity && a2.summary === a1?.summary, a2);

    await prisma.idea.update({ where: { id: idea.id }, data: { oneLiner: "یک‌خطی تغییر یافته" } });
    setTestClient(fakeClient(JSON.stringify({ clarity: 40, feasibility: 30, novelty: 20, summary: "خلاصهٔ دوم" }), { input_tokens: 200, output_tokens: 100 }));
    const a3 = await runAnalyst(idea.id);
    check("پس از تغییر محتوای ایده، runAnalyst دوباره API را صدا می‌زند", callCount === 2, callCount);
    check("نتیجهٔ پس از تغییر محتوا متفاوت است", a3 !== null && a3.clarity === 40, a3);

    // ---------- ۵) کش سؤال نرمال‌شده (همان الگوی dueDiligenceAction) ----------
    callCount = 0;
    setTestClient(fakeClient("پاسخ بررسی دقیق", { input_tokens: 300, output_tokens: 150 }));

    async function ddAsk(rawQuestion: string) {
      const normalized = normalizeQuestion(rawQuestion);
      const hash = createHash("sha256").update(normalized).digest("hex");
      const key = `ai:dd:${idea.id}:${hash}`;
      return cached(key, 60 * 60 * 1000, () => askText("سیستم بررسی دقیق", rawQuestion, 200));
    }

    const q1 = await ddAsk("  آیا این ایده  قابل‌ساخت است؟  ");
    const q2 = await ddAsk("آیا این ایده قابل‌ساخت است؟"); // فاصله‌های متفاوت؛ پس از نرمال‌سازی یکسان
    check("دو سؤال هم‌ارز (فاصله‌های متفاوت) پاسخ یکسان می‌گیرند", q1 === q2 && q1 === "پاسخ بررسی دقیق", { q1, q2 });
    check("برای سؤال هم‌ارز دوم، API دوباره صدا زده نشد", callCount === 1, callCount);

    const q3 = await ddAsk("این یک سؤال کاملاً متفاوت است؟");
    check("سؤال واقعاً متفاوت باعث فراخوانی جدید API می‌شود", callCount === 2, callCount);
    void q3;

    const qArabic = await ddAsk("چرا اين ايده كار مي‌كند؟"); // حروف عربی ي/ك
    const qPersian = await ddAsk("چرا این ایده کار می‌کند؟"); // معادل فارسی ی/ک، پس از نرمال‌سازی یکسان
    check(
      "یکسان‌سازی ي→ی و ك→ک باعث برخورد کش بین نگارش عربی و فارسی می‌شود",
      callCount === 3 && qArabic === qPersian,
      { callCount, qArabic, qPersian }
    );
  } finally {
    setTestClient(undefined);
    await prisma.dueDiligenceMessage.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.idea.deleteMany({ where: { id: { in: createdIdeaIds } } });
    await prisma.setting.deleteMany({ where: { key: { in: createdIdeaIds.map((id) => `ai:analyst:${id}`) } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.team.deleteMany({ where: { id: { in: createdTeamIds } } });
  }

  console.log(`\nنتیجه: ${passed} PASS / ${failed} FAIL`);
  await prisma.$disconnect();
  return failed;
}

main()
  .then((failed) => {
    ownTempDb?.cleanup();
    process.exitCode = failed > 0 ? 1 : 0;
  })
  .catch((e) => {
    console.error(e);
    ownTempDb?.cleanup();
    process.exitCode = 1;
  });
