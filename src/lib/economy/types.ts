/**
 * قرارداد موتور امتیاز — خالص و بدون وابستگی به پایگاه داده.
 * پیاده‌سازی در ./engine.ts با تست کامل در ./engine.test.ts
 *
 * امتیاز هر پروژه فقط از نظر «دیگران» می‌آید: داوران، مردم (با سکه) و هوش مصنوعی.
 * خرج کردن سکه برای خود آدم امتیاز نمی‌سازد؛ و تعداد اعضای تیم هم در امتیاز هیچ اثری ندارد.
 */

export interface EconomyConfig {
  /** سقف اثر هر نفر روی حمایت مردمی یک پروژه (سکه) */
  supportCap: number;
  weights: { jury: number; people: number; ai: number };
}

export interface JuryScores {
  works: number | null; // ۰..۱۰ آیا واقعاً کار می‌کند؟
  value: number | null; // ۰..۱۰ ارزش واقعی
  pitch: number | null; // ۰..۱۰ تیزر و ارائه
}

export interface TeamInput {
  teamId: string;
  memberIds: string[];
  /**
   * همهٔ سکه‌هایی که دیگران به این پروژه داده‌اند: حمایت از ایده، خرید محصول و برد حراج.
   * سکهٔ اعضای خود تیم (در صورت وجود) در موتور کنار گذاشته می‌شود.
   */
  supports: { userId: string; amount: number }[];
  jury: JuryScores | null;
  aiQuality: number | null; // ۰..۱۰۰
  /** کسر امتیاز تقلب (تأییدشده توسط برگزارکننده) */
  cheatPenalty: number;
}

export interface TeamResult {
  teamId: string;
  memberCount: number;
  /** ۰..۱۰۰ میانگین پرسش‌های داوری؛ null = هنوز داوری نشده */
  juryRaw: number | null;
  /**
   * نمرهٔ داوری انسانی که در امتیاز حساب می‌شود: همان juryRaw (داوری‌نشده = صفر).
   * نام فیلد برای سازگاری با ستون TeamScore.juryAdjusted مانده است؛ هیچ تعدیلی بر اساس اندازهٔ تیم ندارد.
   */
  juryAdjusted: number;
  /** حمایت مردمی: (Σ √min(سکهٔ هر حامی، سقف))² */
  people: number;
  supporters: number;
  coinsReceived: number;
  /** ۰..۱۰۰ داوری هوش مصنوعی؛ null = هنوز ارزیابی نشده */
  ai: number | null;
  cheatPenalty: number;
  pts: { jury: number; people: number; ai: number };
  total: number;
  rank?: number;
}

export interface ScoreOutput {
  teams: TeamResult[];
}
