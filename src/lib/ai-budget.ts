import { prisma } from "./db";

/**
 * ردیابی هزینه و سقف بودجهٔ روزانهٔ فراخوانی‌های Claude.
 * منبع قیمت‌ها: اسکیل claude-api (دلار به ازای هر یک میلیون توکن)، تاریخ ۲۰۲۶-۰۹-۱۸.
 * قیمت کش نوشتن/خواندن طبق الگوی مستندشدهٔ Anthropic تخمین زده شده: نوشتن ≈ ۱.۲۵× ورودی، خواندن ≈ ۰.۱× ورودی.
 */

export type ModelPricing = { input: number; output: number; cacheWrite: number; cacheRead: number };

function priced(input: number, output: number): ModelPricing {
  return { input, output, cacheWrite: input * 1.25, cacheRead: input * 0.1 };
}

/** دلار به ازای هر ۱M توکن. */
export const PRICING: Record<string, ModelPricing> = {
  "claude-haiku-4-5": priced(1.0, 5.0),
  "claude-sonnet-5": priced(2.0, 10.0),
  "claude-sonnet-4-6": priced(3.0, 15.0),
  "claude-opus-4-6": priced(5.0, 25.0),
  "claude-opus-4-7": priced(5.0, 25.0),
  "claude-opus-4-8": priced(5.0, 25.0),
  "claude-opus-5": priced(5.0, 25.0),
  "claude-fable-5": priced(10.0, 50.0),
  "claude-fable-5-1": priced(10.0, 50.0),
};

/** گران‌ترین قیمت شناخته‌شده؛ برای مدل‌های ناشناس به‌کار می‌رود. */
const MOST_EXPENSIVE: ModelPricing = priced(10.0, 50.0);

export function getPricing(model: string): ModelPricing {
  const p = PRICING[model];
  if (p) return p;
  console.warn(`ai-budget: قیمت مدل «${model}» شناخته‌شده نیست؛ از گران‌ترین قیمت شناخته‌شده استفاده می‌شود.`);
  return MOST_EXPENSIVE;
}

export type UsageTokens = {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
};

export function computeCostUsd(model: string, usage: UsageTokens): number {
  const p = getPricing(model);
  const input = usage.input_tokens || 0;
  const output = usage.output_tokens || 0;
  const cacheWrite = usage.cache_creation_input_tokens || 0;
  const cacheRead = usage.cache_read_input_tokens || 0;
  return (
    (input * p.input + output * p.output + cacheWrite * p.cacheWrite + cacheRead * p.cacheRead) / 1_000_000
  );
}

/** کلید روز محلی تهران به شکل YYYY-MM-DD. */
export function tehranDayKey(d: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value ?? "0000";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${day}`;
}

/** بازهٔ UTC روز جاری تهران؛ برای شمارش ردیف‌های دیتابیس بر اساس createdAt. */
export function tehranDayRangeUtc(d: Date = new Date()): { start: Date; end: Date } {
  const key = tehranDayKey(d);
  // افست فعلی تهران (۳:۳۰+ یا با تغییر ساعت رسمی) را با مقایسهٔ نمایش محلی به‌دست می‌آوریم.
  const utcGuess = new Date(`${key}T00:00:00.000Z`);
  const tehranAtGuess = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tehran",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(utcGuess);
  const [datePart, timePart] = tehranAtGuess.split(", ");
  const [hh, mm] = timePart.split(":").map(Number);
  const offsetMinutes = hh * 60 + mm; // فاصلهٔ نیمه‌شب UTC تا همان لحظه در تهران
  const start = new Date(utcGuess.getTime() - offsetMinutes * 60_000);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  void datePart;
  return { start, end };
}

export type DailyUsage = {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  costUsd: number;
};

const EMPTY_USAGE: DailyUsage = { calls: 0, inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0, costUsd: 0 };

function usageSettingKey(day: string) {
  return `ai:usage:${day}`;
}

function parseUsage(value: string | undefined): DailyUsage {
  if (!value) return { ...EMPTY_USAGE };
  try {
    const parsed = JSON.parse(value) as Partial<DailyUsage>;
    return {
      calls: parsed.calls ?? 0,
      inputTokens: parsed.inputTokens ?? 0,
      outputTokens: parsed.outputTokens ?? 0,
      cacheWriteTokens: parsed.cacheWriteTokens ?? 0,
      cacheReadTokens: parsed.cacheReadTokens ?? 0,
      costUsd: parsed.costUsd ?? 0,
    };
  } catch {
    return { ...EMPTY_USAGE };
  }
}

/** پس از هر فراخوانی موفق API، مصرف امروز را با تراکنش اتمیک خواندن-تغییر-نوشتن ثبت می‌کند. */
export async function recordUsage(model: string, usage: UsageTokens): Promise<void> {
  const key = usageSettingKey(tehranDayKey());
  const cost = computeCostUsd(model, usage);
  await prisma.$transaction(async (tx) => {
    const row = await tx.setting.findUnique({ where: { key } });
    const current = parseUsage(row?.value);
    const next: DailyUsage = {
      calls: current.calls + 1,
      inputTokens: current.inputTokens + (usage.input_tokens || 0),
      outputTokens: current.outputTokens + (usage.output_tokens || 0),
      cacheWriteTokens: current.cacheWriteTokens + (usage.cache_creation_input_tokens || 0),
      cacheReadTokens: current.cacheReadTokens + (usage.cache_read_input_tokens || 0),
      costUsd: current.costUsd + cost,
    };
    await tx.setting.upsert({
      where: { key },
      create: { key, value: JSON.stringify(next) },
      update: { value: JSON.stringify(next) },
    });
  });
}

export async function getUsage(day: string = tehranDayKey()): Promise<DailyUsage> {
  const row = await prisma.setting.findUnique({ where: { key: usageSettingKey(day) } });
  return parseUsage(row?.value);
}

export function dailyBudgetUsd(): number {
  const v = Number(process.env.AI_DAILY_BUDGET_USD);
  return Number.isFinite(v) && v > 0 ? v : 10;
}

export function userDailyMessageCap(): number {
  const v = Number(process.env.AI_USER_DAILY_MESSAGES);
  return Number.isFinite(v) && v > 0 ? Math.round(v) : 30;
}

export type BudgetStatus = { ok: boolean; spent: number; budget: number };

/** پیش از هر فراخوانی API بررسی می‌شود؛ در صورت عبور از سقف، هیچ فراخوانی واقعی انجام نمی‌شود. */
export async function checkDailyBudget(): Promise<BudgetStatus> {
  const budget = dailyBudgetUsd();
  const usage = await getUsage();
  return { ok: usage.costUsd < budget, spent: usage.costUsd, budget };
}

export type UserCapStatus = { ok: boolean; used: number; cap: number };

/** سقف روزانهٔ پیام‌های چت بررسی دقیق برای یک کاربر (بر اساس روز محلی تهران). */
export async function checkUserDailyMessageCap(userId: string): Promise<UserCapStatus> {
  const cap = userDailyMessageCap();
  const { start, end } = tehranDayRangeUtc();
  const used = await prisma.dueDiligenceMessage.count({
    where: { userId, createdAt: { gte: start, lt: end } },
  });
  return { ok: used < cap, used, cap };
}

/** نرمال‌سازی سؤال برای کش: trim، فشرده‌سازی فاصله‌ها، کوچک‌سازی حروف لاتین، یکسان‌سازی ی/ك فارسی. */
export function normalizeQuestion(q: string): string {
  return q
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک");
}
