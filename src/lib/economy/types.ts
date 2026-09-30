/**
 * قرارداد موتور اقتصاد — خالص و بدون وابستگی به پایگاه داده.
 * پیاده‌سازی در ./engine.ts با تست کامل در ./engine.test.ts
 */

export interface EconomyConfig {
  seedWallet: number;       // ۱۰۰
  buyWallet: number;        // ۱۰۰
  maxPerTarget: number;     // ۴۰: سقف روی هر ایده/محصول برای هر نفر
  penaltyPerCoin: number;   // ۱
  minRevenueShare: number;  // ۲۰
  maxRevenueShare: number;  // ۶۰
  roiSmoothing: number;     // ۲۰: ROI = dividendsPaid / (externalCapital + roiSmoothing)
  shieldFloor: number;      // ۰٫۵: سپر، اعتبار پرتفوی سرمایه‌گذاریِ بیمه‌شده حداقل این ضریب × مبلغ
  community: { uniqueBuyer: number; heart: number };
  weights: {
    sales: number; quality: number; capital: number; roi: number; teaser: number; community: number;
    portfolio: number; taste: number;
  };
}

export interface TeamInput {
  teamId: string;
  memberIds: string[];
  revenueShare: number;                 // درصد سود سرمایه‌گذار
  investments: { userId: string; amount: number; selfFunded: boolean }[];
  sales: { userId: string; amount: number }[];  // خریدها + حراج زنده (برنده)؛ amount = درآمد فروشنده (قیمت کامل، حتی با تخفیف چانه‌زنی)
  hearts: number;
  juryQuality: number | null;  // ۰..۱۰۰
  juryTeaser: number | null;   // ۰..۱۰۰
  aiQuality: number | null;    // ۰..۱۰۰ (فقط اگر داور نداریم استفاده می‌شود)
}

export interface MemberWallet {
  userId: string;
  teamId: string | null;
  seedLeft: number;
  buyLeft: number;
  /**
   * جریمه فقط برای سکه‌ای است که «می‌شد» خرج کرد:
   * seedSpendable = بیشترین بذری که هنوز می‌توانست روی ایده‌های تیم‌های دیگر بگذارد
   *   (Σ روی ایده‌های ثبت‌شدهٔ دیگران: max(0, maxPerTarget − قبلاً گذاشته)).
   * buySpendable = بیشترین سکهٔ خریدی که هنوز می‌توانست در بازار خرج کند
   *   (Σ روی محصولات ثبت‌شدهٔ دیگران: تعداد واحدِ مجاز تا سقف × قیمتی که خودش می‌پردازد).
   * penalty = penaltyPerCoin × (min(seedLeft, seedSpendable) + min(buyLeft, buySpendable))
   */
  seedSpendable: number;
  buySpendable: number;
  /**
   * قدرت سپر (بیمهٔ یک سرمایه‌گذاری): تیمی که دارندهٔ سپر یک‌بار انتخاب کرده؛
   * فقط سطر سود (این کاربر، همین تیم) از کف سپر بهره می‌برد. null = سپر ندارد یا انتخاب نکرده.
   */
  shieldTeamId: string | null;
}

export interface DividendLine {
  userId: string;
  teamId: string;     // تیم سرمایه‌پذیر
  invested: number;
  dividend: number;   // سکهٔ سود (گرد به پایین) — واقعاً پرداخت می‌شود
  portfolioCredit: number; // اعتبار در امتیاز پرتفوی: فقط برای تیمِ انتخاب‌شدهٔ سپر max(dividend, floor(invested × shieldFloor))، وگرنه = dividend
}

export interface TeamResult {
  teamId: string;
  grossSales: number;
  dividendsPaid: number;
  netSales: number;
  externalCapital: number;
  selfCapital: number;
  investorRoi: number;     // dividendsPaid / (externalCapital + roiSmoothing)
  uniqueBuyers: number;
  hearts: number;
  quality: number;         // ۰..۱۰۰ نمرهٔ مؤثر
  teaser: number;
  portfolio: number;       // Σ portfolioCredit سطرهای سود اعضای این تیم (از تیم‌های دیگر)
  taste: number;           // Σ روی خریدهای اعضا از تیم‌های دیگر: amount × کیفیت مؤثر فروشنده / ۱۰۰
  unspentPenalty: number;  // مثبت؛ از امتیاز کم می‌شود
  pts: {
    sales: number; quality: number; capital: number; roi: number; teaser: number; community: number;
    portfolio: number; taste: number;
  };
  total: number;
  rank?: number;
}

export interface ScoreOutput {
  teams: TeamResult[];
  dividends: DividendLine[];
}
