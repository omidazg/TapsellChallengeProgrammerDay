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

/** ایده را با هوش مصنوعی تحلیل و نتیجه را روی رکورد Idea ذخیره می‌کند */
export async function runAnalyst(ideaId: string): Promise<AnalystResult | null> {
  const idea = await prisma.idea.findUnique({ where: { id: ideaId } });
  if (!idea) return null;

  const user = [
    `عنوان: ${idea.title}`,
    `یک‌خطی: ${idea.oneLiner}`,
    `مسئله: ${idea.problem}`,
    `مخاطب: ${idea.audience}`,
    `برنامهٔ ساخت ۴۸ ساعته: ${idea.buildPlan}`,
    `سقف سرمایه درخواستی: ${idea.fundingCap} سکه`,
    `سهم سود سرمایه‌گذار: ${idea.revenueShare}٪`,
  ].join("\n");

  const result = await askJson<AnalystResult>(SYSTEM, user, SCHEMA);
  if (!result) return null;

  const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

  await prisma.idea.update({
    where: { id: ideaId },
    data: {
      analystClarity: clamp(result.clarity),
      analystFeasibility: clamp(result.feasibility),
      analystNovelty: clamp(result.novelty),
      analystSummary: result.summary,
    },
  });

  return result;
}
