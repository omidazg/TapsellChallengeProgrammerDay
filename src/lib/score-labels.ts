/**
 * برچسب، ایموجی و توضیح فارسیِ سه معیار امتیازدهی (src/lib/constants.ts → SCORE_WEIGHTS).
 * تک‌منبع مشترک برای همهٔ صفحاتی که ریزامتیاز تیم را نمایش می‌دهند (نتایج، گزارش تیم،
 * جدول امتیازات، پنل تسویه، صفحهٔ اصلی، راهنما و دستیار هوش مصنوعی) تا متن‌ها هیچ‌وقت
 * از هم واگرا نشوند. اعداد همیشه مستقیم از SCORE_WEIGHTS خوانده می‌شوند، نه از اینجا.
 */
import { SCORE_WEIGHTS } from "./constants";

export type ScoreCategoryKey = keyof typeof SCORE_WEIGHTS;

/** ترتیب نمایش معیارها؛ همان ترتیب کلیدهای SCORE_WEIGHTS در constants.ts */
export const SCORE_CATEGORY_ORDER: readonly ScoreCategoryKey[] = ["jury", "people", "ai"];

export const SCORE_CATEGORY_LABELS: Record<ScoreCategoryKey, { label: string; emoji: string }> = {
  jury: { label: "داوری انسانی", emoji: "🧑‍⚖️" },
  people: { label: "حمایت مردمی", emoji: "👥" },
  ai: { label: "داوری هوش مصنوعی", emoji: "🤖" },
};

/** چه کسی این معیار را تعیین می‌کند */
export const SCORE_CATEGORY_JUDGE: Record<ScoreCategoryKey, string> = {
  jury: "داوران",
  people: "بازیکن‌ها با سکه‌هایشان",
  ai: "هوش مصنوعی",
};

/** توضیح یک‌خطی «چه چیزی را می‌سنجد» — در جدول راهنما و متن دستیار هوش مصنوعی استفاده می‌شود */
export const SCORE_CATEGORY_MEASURES: Record<ScoreCategoryKey, string> = {
  jury: "داوران دمو را اجرا می‌کنند و به سه پرسش از ۰ تا ۱۰ نمره می‌دهند: آیا واقعاً کار می‌کند؟ چه ارزش واقعی‌ای دارد؟ تیزر و ارائه چقدر خوب است؟",
  people: "سکه‌هایی که دیگران با حمایت از ایده، خرید محصول و حراج به پروژه داده‌اند؛ تعداد حامی‌ها از مقدار سکه مهم‌تر است.",
  ai: "ارزیابی خودکار هوش مصنوعی از محصول (کامل بودن، وضوح و کیفیت صفحهٔ محصول)، جدا از نمرهٔ داوران.",
};

/** توضیح یک‌خطی «چطور بالا ببری» — در جدول راهنما استفاده می‌شود */
export const SCORE_CATEGORY_TIPS: Record<ScoreCategoryKey, string> = {
  jury: "محصولی بساز که واقعاً کار کند و دمویش در دسترس باشد؛ تیزر کوتاه و روشن بساز.",
  people: "از آدم‌های بیشتری حمایت بگیر؛ ده حامی کوچک خیلی بیشتر از یک حامی بزرگ می‌ارزد.",
  ai: "صفحهٔ محصول را کامل کن: توضیح روشن، تصاویر واقعی و لینک دمو.",
};
