import { createHash } from "crypto";
import { prisma } from "./db";
import { askJson } from "./ai";

type AnalystResult = {
  clarity: number;
  feasibility: number;
  novelty: number;
  summary: string;
};

const SYSTEM = `تو یک تحلیل‌گر باتجربهٔ رویدادهای هکاتون هستی. یک ایدهٔ استارتاپی را که قرار است در ۴۸ ساعت ساخته شود ارزیابی می‌کنی.
سه معیار را از ۰ تا ۱۰۰ نمره بده:
- clarity: وضوح مسئله و راه‌حل
- feasibility: قابل‌ساخت بودن در ۴۸ ساعت با یک تیم کوچک
- novelty: تازگی و تمایز نسبت به راه‌حل‌های رایج
سپس یک خلاصهٔ تحلیلی فارسی حداکثر ۶۰ کلمه بنویس که نقاط قوت و ریسک اصلی را برای یک سرمایه‌گذار توضیح دهد.`;

const SCHEMA = {
  type: "object",
  properties: {
    clarity: { type: "integer", minimum: 0, maximum: 100 },
    feasibility: { type: "integer", minimum: 0, maximum: 100 },
    novelty: { type: "integer", minimum: 0, maximum: 100 },
    summary: { type: "string" },
  },
  required: ["clarity", "feasibility", "novelty", "summary"],
  additionalProperties: false,
};

/** عدد معتبر ۰..۱۰۰ از خروجی مدل (که ممکن است رشته یا بی‌معنا باشد) */
function clampScore(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * ایده را با هوش مصنوعی تحلیل و نتیجه را روی رکورد Idea ذخیره می‌کند.
 * هرگز خطا پرتاب نمی‌کند: در نبود کلید، خطای شبکه یا خروجی نامعتبر `null` برمی‌گرداند
 * تا ثبت نهایی ایده به هوش مصنوعی گره نخورد.
 */
export async function runAnalyst(ideaId: string): Promise<AnalystResult | null> {
  try {
    return await runAnalystUnsafe(ideaId);
  } catch (e) {
    console.error("runAnalyst error", e);
    return null;
  }
}

/** محتوای مؤثر ایده برای هش کش؛ هر تغییری در این فیلدها باعث تحلیل مجدد می‌شود. */
function ideaContentHash(idea: {
  title: string;
  oneLiner: string;
  problem: string;
  audience: string;
  buildPlan: string;
  fundingCap: number;
  revenueShare: number;
}): string {
  const content = [idea.title, idea.oneLiner, idea.problem, idea.audience, idea.buildPlan, idea.fundingCap, idea.revenueShare].join("␟");
  return createHash("sha256").update(content).digest("hex");
}

function analystCacheKey(ideaId: string) {
  return `ai:analyst:${ideaId}`;
}

type AnalystCacheEntry = { hash: string; result: AnalystResult; at: string };

async function runAnalystUnsafe(ideaId: string): Promise<AnalystResult | null> {
  const idea = await prisma.idea.findUnique({ where: { id: ideaId } });
  if (!idea) return null;

  const hash = ideaContentHash(idea);
  const cacheKey = analystCacheKey(ideaId);
  const cachedRow = await prisma.setting.findUnique({ where: { key: cacheKey } });
  if (cachedRow) {
    try {
      const cached = JSON.parse(cachedRow.value) as AnalystCacheEntry;
      if (cached.hash === hash) return cached.result;
    } catch {
      // کش خراب؛ دوباره تولید می‌شود
    }
  }

  const user = [
    `عنوان: ${idea.title}`,
    `یک‌خطی: ${idea.oneLiner}`,
    `مسئله: ${idea.problem}`,
    `مخاطب: ${idea.audience}`,
    `برنامهٔ ساخت ۴۸ ساعته: ${idea.buildPlan}`,
    `سقف سرمایه درخواستی: ${idea.fundingCap} سکه`,
    `سهم سود سرمایه‌گذار: ${idea.revenueShare}٪`,
  ].join("\n");

  const raw = await askJson<Partial<AnalystResult>>(SYSTEM, user, SCHEMA);
  if (!raw || typeof raw !== "object") return null;

  const clarity = clampScore(raw.clarity);
  const feasibility = clampScore(raw.feasibility);
  const novelty = clampScore(raw.novelty);
  const summary = typeof raw.summary === "string" ? raw.summary.trim().slice(0, 1000) : "";

  // اگر هیچ نمرهٔ معتبری برنگشت، چیزی ذخیره نمی‌کنیم.
  if (clarity === null && feasibility === null && novelty === null && !summary) return null;

  const result: AnalystResult = { clarity: clarity ?? 0, feasibility: feasibility ?? 0, novelty: novelty ?? 0, summary };

  await prisma.idea.update({
    where: { id: ideaId },
    data: {
      analystClarity: clarity,
      analystFeasibility: feasibility,
      analystNovelty: novelty,
      analystSummary: summary || null,
    },
  });

  const entry: AnalystCacheEntry = { hash, result, at: new Date().toISOString() };
  await prisma.setting.upsert({
    where: { key: cacheKey },
    create: { key: cacheKey, value: JSON.stringify(entry) },
    update: { value: JSON.stringify(entry) },
  });

  return result;
}
