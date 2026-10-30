/**
 * برچسب، ایموجی و توضیح فارسیِ سه بخش امتیازدهی (src/lib/constants.ts → SCORE_WEIGHTS).
 * تک‌منبع مشترک برای همهٔ صفحاتی که ریزامتیاز تیم را نمایش می‌دهند (نتایج، گزارش تیم،
 * جدول امتیازات، پنل تسویه، صفحهٔ اصلی، راهنما و دستیار هوش مصنوعی) تا متن‌ها هیچ‌وقت
 * از هم واگرا نشوند. اعداد همیشه مستقیم از SCORE_WEIGHTS خوانده می‌شوند، نه از اینجا.
 */
import { SCORE_WEIGHTS } from "./constants";

export type ScoreCategoryKey = keyof typeof SCORE_WEIGHTS;

/** ترتیب نمایش معیارها؛ همان ترتیب کلیدهای SCORE_WEIGHTS در constants.ts */
export const SCORE_CATEGORY_ORDER: readonly ScoreCategoryKey[] = ["jury", "market", "ai"];

export const SCORE_CATEGORY_LABELS: Record<ScoreCategoryKey, { label: string; emoji: string }> = {
  jury: { label: "داوری نهایی", emoji: "🧑‍⚖️" },
  market: { label: "بازار", emoji: "📈" },
  ai: { label: "هوش مصنوعی", emoji: "🤖" },
};

/** چه کسی این معیار را تعیین می‌کند */
export const SCORE_CATEGORY_JUDGE: Record<ScoreCategoryKey, string> = {
  jury: "کمیتهٔ داوری",
  market: "کاربران واقعی در بازار و بازیکن‌ها با سکه‌هایشان",
  ai: "هوش مصنوعی",
};

/** توضیح یک‌خطی «چه چیزی را می‌سنجد» — در جدول راهنما و متن دستیار هوش مصنوعی استفاده می‌شود */
export const SCORE_CATEGORY_MEASURES: Record<ScoreCategoryKey, string> = {
  jury: "هر داور مستقل به معیارهای محور از ۰ تا ۱۰ نمره می‌دهد و میانگین داورها حساب می‌شود. این نمره تا اعلام نتایج مخفی است.",
  market: "نصب فعال، درآمد واقعی، امتیاز ستاره‌ای و تعداد نظر در بازار، به‌اضافهٔ سکه‌هایی که دیگران با حمایت، خرید و حراج داده‌اند. محورهایی که روی بازار منتشر نمی‌شوند فقط حمایت با سکه را دارند.",
  ai: "ارزیابی نهایی هوش مصنوعی از کار ساخته‌شده با پارامترهایی که برای هر محور تعیین می‌کند؛ تا پیش از آن بازخورد موقت حساب می‌شود.",
};

/** توضیح یک‌خطی «چطور بالا ببری» — در جدول راهنما استفاده می‌شود */
export const SCORE_CATEGORY_TIPS: Record<ScoreCategoryKey, string> = {
  jury: "چیزی بساز که واقعاً کار کند و دمویش در دسترس باشد؛ ارائهٔ کوتاه و روشن آماده کن.",
  market: "محصولت را روی بازار منتشر کن و کاربر واقعی جذب کن؛ از آدم‌های بیشتری هم حمایت بگیر.",
  ai: "صفحهٔ ارسال را کامل کن: توضیح روشن، تصاویر واقعی و لینک دمو یا تحویل.",
};
