/**
 * جوایز نقدی مسابقه — پنج جایزه، هر کدام درصدی از «صندوق جایزه».
 * صندوق = پایهٔ ثابت + کل مبلغی که شرکت‌کننده‌ها برای خرید سکه پرداخت کرده‌اند؛
 * پس با خرید سکه خودکار بزرگ‌تر می‌شود. هر پروژه حداکثر یک جایزه می‌برد.
 *
 * این ماژول بدون وابستگی به دیتابیس است (در کامپوننت‌های کلاینت هم استفاده می‌شود).
 * جمع پرداخت‌ها در ./prize-pool.ts (فقط سرور) خوانده می‌شود.
 */

/** پایهٔ صندوق جایزه: ۲ میلیارد تومان */
export const PRIZE_POOL_BASE_MILLION_TOMAN = 2000;

export type PrizeKey = "champion" | "jury" | "ai" | "people" | "live";

export type Prize = {
  key: PrizeKey;
  label: string;
  emoji: string;
  /** سهم از صندوق جایزه (درصد) */
  sharePct: number;
  /** معیار انتخاب برنده */
  criterion: string;
  /** auto: از روی امتیازها؛ pick: انتخاب داوران در پنل داوری */
  how: "auto" | "pick";
};

/** ترتیب همین آرایه ترتیب اهدای جوایز هم هست (هر پروژه حداکثر یک جایزه). */
export const PRIZES: readonly Prize[] = [
  { key: "champion", label: "بنیان‌گذار برتر", emoji: "🏆", sharePct: 35, criterion: "بالاترین امتیاز کل", how: "auto" },
  { key: "jury", label: "انتخاب داوران", emoji: "🛠️", sharePct: 20, criterion: "بالاترین نمرهٔ داوری انسانی", how: "auto" },
  { key: "ai", label: "برترین کاربرد هوش مصنوعی", emoji: "🤖", sharePct: 15, criterion: "انتخاب داوران بین پروژه‌های هوش مصنوعی", how: "pick" },
  { key: "people", label: "انتخاب مردم", emoji: "❤️", sharePct: 15, criterion: "بیشترین حمایت مردمی با سکه", how: "auto" },
  { key: "live", label: "بهترین محصول لایو", emoji: "🚀", sharePct: 15, criterion: "انتخاب داوران بین محصولات منتشرشده روی بازار استودیو", how: "pick" },
];

export type PrizePool = {
  baseMillion: number;
  /** سهم خرید سکه (میلیون تومان) */
  extraMillion: number;
  totalMillion: number;
};

/** صندوق جایزه از روی کل مبلغ خرید سکه (تومان). */
export function prizePoolFrom(coinSalesToman: number): PrizePool {
  const extraMillion = Math.max(0, coinSalesToman) / 1_000_000;
  return {
    baseMillion: PRIZE_POOL_BASE_MILLION_TOMAN,
    extraMillion,
    totalMillion: PRIZE_POOL_BASE_MILLION_TOMAN + extraMillion,
  };
}

/** مبلغ یک جایزه (میلیون تومان) از روی صندوق. */
export function prizeAmountMillion(pool: PrizePool, sharePct: number): number {
  return (pool.totalMillion * sharePct) / 100;
}

/** نمایش مبلغ میلیونی: تا یک رقم اعشار، بدون صفر اضافه (مثلاً ۷۰۰ یا ۷۰۰٫۵) */
export function formatMillion(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}
