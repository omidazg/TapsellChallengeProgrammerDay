/**
 * قرارداد موتور امتیاز — خالص و بدون وابستگی به پایگاه داده.
 * پیاده‌سازی در ./engine.ts با تست کامل در ./engine.test.ts
 *
 * واحد امتیاز «ثبت» است: یک تیم در یک محور. هر تیم می‌تواند در چند محور با محصول‌های جدا شرکت کند
 * و هر ثبت فقط با ثبت‌های همان محور مقایسه می‌شود.
 */
import type { MarketSubWeights, TrackWeights } from "@/lib/tracks";

export interface EconomyConfig {
  /** سقف اثر هر نفر روی حمایت مردمی یک پروژه (سکه) */
  supportCap: number;
  /** وزن‌های هر محور */
  trackWeights: Record<string, TrackWeights>;
  /** امتیاز ستاره‌ای فقط با حداقل این تعداد نظر حساب می‌شود */
  ratingMinComments: number;
}

export interface MarketStats {
  activeInstalls: number;
  revenueToman: number;
  rating: number | null; // ۰..۵
  commentCount: number;
  /** مشکوک به نصب/نظر جعلی: تا رفع پرچم در امتیاز حساب نمی‌شود */
  flagged: boolean;
}

export interface TeamInput {
  teamId: string;
  trackId: string;
  /** دستهٔ فنی/غیرفنی ("" = نامشخص) */
  category: string;
  productId: string | null;
  productName: string;
  memberIds: string[];
  /**
   * همهٔ سکه‌هایی که دیگران به این ثبت داده‌اند: حمایت از ایده، خرید محصول و برد حراج.
   * سکهٔ اعضای خود تیم (در صورت وجود) در موتور کنار گذاشته می‌شود.
   */
  supports: { userId: string; amount: number }[];
  /** ۰..۱۰۰ میانگین نمرهٔ داوران؛ null = هنوز داوری نشده */
  juryRaw: number | null;
  aiQuality: number | null; // ۰..۱۰۰
  stats: MarketStats | null;
  /** کسر امتیاز تقلب (تأییدشده توسط برگزارکننده) */
  cheatPenalty: number;
  /**
   * زمان ثبت نهایی محصول (ms epoch)؛ فقط برای شکستن تساوی رتبه (زودتر جلوتر). null/نبود = بدون محصول (آخر).
   */
  productSubmittedAt?: number | null;
}

export type MarketPoints = Record<keyof MarketSubWeights, number>;

export interface TeamResult {
  teamId: string;
  trackId: string;
  category: string;
  productId: string | null;
  productName: string;
  memberCount: number;
  /** ۰..۱۰۰ میانگین نمرهٔ داوران؛ null = هنوز داوری نشده */
  juryRaw: number | null;
  /** نمرهٔ داوری که در امتیاز حساب می‌شود: همان juryRaw (داوری‌نشده = صفر). */
  juryAdjusted: number;
  /** حمایت مردمی: (Σ √min(سکهٔ هر حامی، سقف))² */
  people: number;
  supporters: number;
  coinsReceived: number;
  /** ۰..۱۰۰ ارزیابی هوش مصنوعی؛ null = هنوز ارزیابی نشده */
  ai: number | null;
  cheatPenalty: number;
  /** امتیاز هر بخش (جمع وزن‌ها ۱۰۰۰) */
  pts: { jury: number; market: number; ai: number };
  /** ریز امتیاز بخش بازار */
  marketDetail: MarketPoints;
  total: number;
  /** رتبه در محور */
  rank?: number;
  /** رتبه در نمای کلی همهٔ محورها */
  overallRank?: number;
}

export interface ScoreOutput {
  /** همهٔ ثبت‌ها به ترتیب رتبهٔ کلی */
  teams: TeamResult[];
}

/** کلید یکتای یک ثبت */
export function entryKey(t: { teamId: string; trackId: string }): string {
  return `${t.teamId}:${t.trackId}`;
}

export type { TrackWeights };
