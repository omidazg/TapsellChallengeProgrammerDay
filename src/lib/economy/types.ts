/**
 * قرارداد موتور اقتصاد — خالص و بدون وابستگی به پایگاه داده.
 * پیاده‌سازی در ./engine.ts با تست کامل در ./engine.test.ts
 */

export interface EconomyConfig {
  seedWallet: number;       // ۱۰۰
  buyWallet: number;        // ۱۰۰
  maxPerTarget: number;     // ۴۰: سقف روی هر ایده/محصول برای هر نفر
  penaltyPerCoin: number;   // ۱٫۵
  minRevenueShare: number;  // ۲۰
  maxRevenueShare: number;  // ۶۰
  weights: { sales: number; quality: number; capital: number; roi: number; teaser: number; community: number };
}

export interface TeamInput {
  teamId: string;
  memberIds: string[];
  revenueShare: number;                 // درصد سود سرمایه‌گذار
  investments: { userId: string; amount: number; selfFunded: boolean }[];
  sales: { userId: string; amount: number }[];  // خریدها + حراج زنده (برنده)
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
  shieldUsed: boolean; // قدرت سپر: ۱۰ سکه از جریمه معاف
}

export interface DividendLine {
  userId: string;
  teamId: string;     // تیم سرمایه‌پذیر
  invested: number;
  dividend: number;   // سکهٔ سود (گرد به پایین)
}

export interface TeamResult {
  teamId: string;
  grossSales: number;
  dividendsPaid: number;
  netSales: number;
  externalCapital: number;
  selfCapital: number;
  investorRoi: number;     // dividendsPaid / externalCapital (۰ اگر سرمایه‌ای نبود)
  uniqueBuyers: number;
  hearts: number;
  quality: number;         // ۰..۱۰۰ نمرهٔ مؤثر
  teaser: number;
  unspentPenalty: number;  // مثبت؛ از امتیاز کم می‌شود
  pts: { sales: number; quality: number; capital: number; roi: number; teaser: number; community: number };
  total: number;
  rank?: number;
}

export interface ScoreOutput {
  teams: TeamResult[];
  dividends: DividendLine[];
}
