/**
 * انتخاب برندهٔ حراج‌ها — توابع خالص (بدون I/O) تا مستقیم قابل تست باشند.
 *
 * قاعدهٔ مشترک: هیچ برنده‌ای هرگز کمتر از قیمتی که قاعدهٔ حراج تعیین می‌کند نمی‌پردازد.
 * اگر پیشنهاددهنده در لحظهٔ تسویه دیگر موجودی کافی نداشته باشد، پیشنهادش «نامعتبر»
 * حساب و کنار گذاشته می‌شود و نوبت به پیشنهاد معتبر بعدی می‌رسد.
 */

export type BidCandidate = {
  /** شناسهٔ پیشنهاددهنده (کاربر در حراج زنده، تیم در حراج جایگاه تبلیغاتی) */
  bidderId: string;
  amount: number;
  createdAt: Date | number;
};

export type WinningBid<B extends BidCandidate> = { bid: B; price: number };

/**
 * موجودی فعلی یک پیشنهاددهنده؛ `null` یعنی دیگر وجود ندارد (مثلاً حذف شده) و پیشنهادش نامعتبر است.
 */
export type BalanceOf = (bidderId: string) => number | null | undefined;

function ts(d: Date | number): number {
  return typeof d === "number" ? d : d.getTime();
}

/**
 * پیشنهادها را به ترتیب اولویت می‌چیند (مبلغ نزولی، در تساوی زودتر جلوتر) و از هر
 * پیشنهاددهنده فقط بالاترین پیشنهادش را نگه می‌دارد. آرایهٔ ورودی تغییر نمی‌کند.
 */
export function rankBids<B extends BidCandidate>(bids: readonly B[]): B[] {
  const sorted = [...bids].sort((a, b) => b.amount - a.amount || ts(a.createdAt) - ts(b.createdAt));
  const seen = new Set<string>();
  const out: B[] = [];
  for (const b of sorted) {
    if (seen.has(b.bidderId)) continue;
    seen.add(b.bidderId);
    out.push(b);
  }
  return out;
}

/**
 * حراج زنده (قیمت اول): اولین پیشنهاد (به ترتیب اولویت) که صاحبش هنوز موجودی کافی
 * برای *کل* مبلغ پیشنهادش دارد برنده است و دقیقاً همان مبلغ را می‌پردازد.
 * پیشنهادهای بدون پشتوانه کنار گذاشته می‌شوند؛ اگر هیچ پیشنهاد معتبری نماند، null.
 */
export function pickFirstPriceWinner<B extends BidCandidate>(
  bids: readonly B[],
  balanceOf: BalanceOf
): WinningBid<B> | null {
  for (const bid of rankBids(bids)) {
    const balance = balanceOf(bid.bidderId);
    if (balance == null) continue;
    if (balance >= bid.amount) return { bid, price: bid.amount };
  }
  return null;
}

/**
 * حراج مهروموم قیمت دوم: برنده بالاترین پیشنهاد معتبر است و
 * min(max(دومین پیشنهادِ باقی‌مانده، ۱), پیشنهاد خودش) را می‌پردازد (تک‌پیشنهادی = یک سکهٔ نمادین).
 * اگر موجودی برنده به این قیمت نرسد، پیشنهادش نامعتبر است و کنار می‌رود؛ قیمت دوم
 * دوباره در میان پیشنهادهای باقی‌مانده حساب می‌شود — هرگز کمتر از قیمت قاعده گرفته نمی‌شود.
 */
export function pickSecondPriceWinner<B extends BidCandidate>(
  bids: readonly B[],
  balanceOf: BalanceOf
): WinningBid<B> | null {
  const ranked = rankBids(bids);
  for (let i = 0; i < ranked.length; i++) {
    const bid = ranked[i];
    const second = ranked[i + 1]?.amount ?? 0;
    const price = Math.min(Math.max(second, 1), bid.amount);
    const balance = balanceOf(bid.bidderId);
    if (balance == null) continue;
    if (balance >= price) return { bid, price };
  }
  return null;
}
