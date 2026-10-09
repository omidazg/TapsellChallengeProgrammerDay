/** ثابت‌های بازی — قابل بازنویسی از جدول Setting در پنل برگزارکننده */

/** مهارت اصلی هر نفر — فقط برچسب پروفایل است و در امتیاز اثری ندارد. */
export const ROLES = {
  BUILDER: { label: "سازنده", desc: "محصول را می‌سازد: کد، نمونهٔ اولیه، دمو.", emoji: "🛠️" },
  STORYTELLER: { label: "قصه‌گو", desc: "تیزر، تصاویر، متن معرفی و صفحهٔ محصول.", emoji: "🎬" },
  DEALMAKER: { label: "معامله‌گر", desc: "قیمت‌گذاری، جذب حمایت، حراج.", emoji: "🤝" },
} as const;
export type RoleKey = keyof typeof ROLES;

/** قیمت هر سکه: هزار تومان (ده هزار ریال). */
export const COIN_PRICE_TOMAN = 1000;
export const COIN_PRICE_RIAL = COIN_PRICE_TOMAN * 10;

/** بسته‌های پیشنهادی خرید سکه (کاربر مقدار دلخواه هم می‌تواند وارد کند). */
export const COIN_PACKAGES = [20, 50, 100, 200] as const;

export const DEFAULTS = {
  /** سکهٔ رایگان اولیهٔ هر نفر (یک کیف واحد برای حمایت از ایده‌ها، خرید، حراج و جایگاه تبلیغاتی) */
  startingCoins: 200,
  /**
   * سقف «اثر» هر نفر روی امتیاز حمایت مردمی یک پروژه (سکه). خرج بیشتر ممنوع نیست؛
   * فقط تا همین مقدار در امتیاز حساب می‌شود تا با خرید سکه نشود امتیاز خرید.
   */
  supportCap: 50,
  /** جبران کمبود نیروی تیم کوچک: درصد افزایش نمرهٔ داوری انسانی */
  soloBoostPct: 15,
  duoBoostPct: 7,
  /** سقف سکه‌ای که هر نفر در کل بازی می‌تواند بخرد */
  maxBoughtCoinsPerUser: 1000,
  minCoinPurchase: 10,
  minPrice: 5,
  maxPrice: 40,
  bidIncrement: 2,
  antiSnipeWindowSec: 30,
  antiSnipeExtendSec: 60,
  auctionDurationSec: 300,
  /** فرستادن محصول به صف حراج تا این مدت پیش از پایان روز بازار ممکن است */
  auctionEnqueueCutoffMin: 20,
  collusionThreshold: 60, // حداقل مجموع جریان متقابل (خرید + حمایت) بین دو تیم
  collusionShare: 0.35, // و هر طرف دست‌کم این سهم از خرج بیرونی‌اش را به طرف دیگر داده باشد
  /** قیمت ثابت هر ساعت جایگاه تبلیغاتی (سکه) */
  adslotPriceBanner: 60,
  adslotPriceFeatured: 40,
  adslotPricePush: 80,
  /** هر تیم حداکثر چند ساعت جایگاه تبلیغاتی می‌تواند بخرد */
  adslotMaxPerTeam: 2,
};

/**
 * وزن سه معیار امتیاز (جمع = ۱۰۰۰). هر معیار نسبت به بهترین پروژهٔ همان معیار سنجیده می‌شود.
 */
export const SCORE_WEIGHTS = {
  jury: 500, // داوری انسانی (پس از جبران تیم کوچک)
  people: 300, // حمایت مردمی با سکه (فرمول درجه‌دو)
  ai: 200, // داوری هوش مصنوعی
};

export const AD_SLOT_KINDS = {
  BANNER: { label: "بنر بالای بازار", emoji: "🏳️" },
  FEATURED: { label: "کارت محصول ویژه", emoji: "⭐" },
  PUSH: { label: "اعلان به همه", emoji: "🔔" },
} as const;
