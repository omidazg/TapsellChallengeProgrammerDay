/**
 * برچسب هوش مصنوعی روی کارت هر ایده و هر محصول: «🤖 عالی» / «خوب» / «نیاز به کار» + خلاصهٔ کوتاه دلیل.
 * برای ایده از میانگین سه نمرهٔ تحلیل‌گر (وضوح، امکان‌پذیری، نوآوری) و برای محصول از نمرهٔ داور
 * هوش مصنوعی استفاده می‌شود. این برچسب فقط راهنماست؛ نمرهٔ داوری انسانی جدا و مستقل است.
 * بدون وابستگی به دیتابیس (در کامپوننت‌های کلاینت هم قابل استفاده است).
 */

export type AiTagLevel = "great" | "good" | "work";

export type AiTagInfo = { level: AiTagLevel; label: string; score: number; summary: string };

export const AI_TAG_LABEL: Record<AiTagLevel, string> = {
  great: "عالی",
  good: "خوب",
  work: "نیاز به کار",
};

/** آستانه‌ها روی نمرهٔ ۰..۱۰۰ */
export const AI_TAG_THRESHOLDS = { great: 75, good: 50 } as const;

export function aiTagLevel(score: number): AiTagLevel {
  if (score >= AI_TAG_THRESHOLDS.great) return "great";
  if (score >= AI_TAG_THRESHOLDS.good) return "good";
  return "work";
}

function shortSummary(text: string | null | undefined, max = 140): string {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trimEnd()}…`;
}

/** برچسب ایده از نمره‌های تحلیل‌گر؛ null اگر هنوز تحلیل نشده */
export function ideaAiTag(idea: {
  analystClarity: number | null;
  analystFeasibility: number | null;
  analystNovelty: number | null;
  analystSummary: string | null;
}): AiTagInfo | null {
  const scores = [idea.analystClarity, idea.analystFeasibility, idea.analystNovelty].filter(
    (v): v is number => typeof v === "number"
  );
  if (scores.length === 0) return null;
  const score = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  const level = aiTagLevel(score);
  return { level, label: AI_TAG_LABEL[level], score, summary: shortSummary(idea.analystSummary) };
}

/** برچسب محصول از نمرهٔ داور هوش مصنوعی؛ null اگر هنوز ارزیابی نشده */
export function productAiTag(product: { aiQuality: number | null; aiNotes: string | null }): AiTagInfo | null {
  if (typeof product.aiQuality !== "number") return null;
  const level = aiTagLevel(product.aiQuality);
  return { level, label: AI_TAG_LABEL[level], score: product.aiQuality, summary: shortSummary(product.aiNotes) };
}
