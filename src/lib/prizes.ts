/** جوایز نقدی نهایی مسابقه (تصمیم برگزارکننده — قابل به‌روزرسانی تا شروع مسابقه) */

export const CASH_PRIZE_TOTAL_MILLION_TOMAN = 2000; // ۲ میلیارد تومان

export const PRIZES: { key: string; label: string; amountMillion: number }[] = [
  { key: "grand", label: "قهرمان بزرگ", amountMillion: 500 },
  { key: "product", label: "محصول سال", amountMillion: 300 },
  { key: "aiBusiness", label: "کسب‌وکار هوش مصنوعی سال", amountMillion: 250 },
  { key: "aiContent", label: "محتوای هوش مصنوعی سال", amountMillion: 200 },
  { key: "internalAi", label: "بهترین راهکار داخلی هوش مصنوعی", amountMillion: 150 },
  { key: "growth", label: "بیشترین پتانسیل رشد", amountMillion: 150 },
  { key: "emerging", label: "بهترین ایدهٔ نوظهور", amountMillion: 100 },
  { key: "individual", label: "بهترین سازندهٔ فردی", amountMillion: 100 },
  { key: "people", label: "انتخاب مردم", amountMillion: 100 },
  { key: "crossTeam", label: "بهترین تیم میان‌بخشی", amountMillion: 75 },
  { key: "aiForGood", label: "هوش مصنوعی برای خیر", amountMillion: 75 },
];
