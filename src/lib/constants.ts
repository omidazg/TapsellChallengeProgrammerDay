/** ثابت‌های بازی — قابل بازنویسی از جدول Setting در پنل برگزارکننده */

export const ROLES = {
  BUILDER: { label: "سازنده", desc: "محصول را می‌سازد: کد، نمونهٔ اولیه، دمو.", emoji: "🛠️" },
  STORYTELLER: { label: "قصه‌گو", desc: "تیزر، تصاویر، متن معرفی و صفحهٔ محصول.", emoji: "🎬" },
  DEALMAKER: { label: "معامله‌گر", desc: "قیمت‌گذاری، جذب سرمایه، حراج.", emoji: "🤝" },
} as const;
export type RoleKey = keyof typeof ROLES;

export const POWERS = {
  HYPE: { label: "هیاهو", desc: "یک ساعت جایگاه «محصول ویژه» رایگان در روز بازار.", emoji: "📣" },
  BARGAIN: { label: "چانه‌زنی", desc: "۱۵٪ تخفیف روی همهٔ خریدهای روز بازار؛ فروشنده همچنان قیمت کامل را می‌گیرد.", emoji: "🏷️" },
  ANGEL: { label: "فرشته", desc: "۲۰ سکهٔ بذر اضافه که خودکار روی کم‌سرمایه‌ترین ایده سرمایه‌گذاری می‌شود و سودش مال توست.", emoji: "👼" },
  SECOND_WIND: { label: "نفس دوم", desc: "دو دقیقه تمدید یک حراج زنده.", emoji: "⏱️" },
  INSIDER: { label: "خبرچین", desc: "دیدن فهرست سرمایه‌گذاران یک تیم پیش از عمومی شدن.", emoji: "🕵️" },
  SHIELD: { label: "سپر", desc: "بیمهٔ سرمایه: اگر سرمایه‌گذاری‌ای کمتر از نصف مبلغش سود داد، در امتیاز پرتفوی تیمت نصف مبلغ حساب می‌شود.", emoji: "🛡️" },
} as const;
export type PowerKey = keyof typeof POWERS;

export const DEFAULTS = {
  seedWallet: 100,
  buyWallet: 100,
  maxPerTarget: 40, // سقف سرمایه‌گذاری/خرید روی یک هدف
  penaltyPerCoin: 1,
  minPrice: 5,
  maxPrice: 40, // هرگز بیشتر از maxPerTarget نباشد؛ وگرنه محصول قابل خرید نیست
  minRevenueShare: 20,
  maxRevenueShare: 60,
  bidIncrement: 2,
  antiSnipeWindowSec: 30,
  antiSnipeExtendSec: 60,
  auctionDurationSec: 300,
  collusionThreshold: 60, // حداقل مجموع جریان متقابل (خرید + سرمایه‌گذاری) بین دو تیم
  collusionShare: 0.35, // و هر طرف دست‌کم این سهم از خرج بیرونی‌اش را به طرف دیگر داده باشد
  bargainDiscount: 0.15,
  angelBonus: 20,
  roiSmoothing: 20, // ROI = سود پرداختی ÷ (سرمایهٔ بیرونی + این عدد)
  shieldFloor: 0.5, // سپر: حداقل اعتبار پرتفوی = این ضریب × مبلغ سرمایه‌گذاری
};

/**
 * وزن‌های امتیاز (جمع = ۱۰۰۰). هر بخش نسبت به بهترین تیم همان بخش سنجیده می‌شود.
 * portfolio و taste به خرج‌کردن «هوشمندانه» پاداش می‌دهند، نه فقط خرج‌کردن.
 */
export const SCORE_WEIGHTS = {
  sales: 300, // فروش خالص (پس از سود سهام)
  quality: 200, // کیفیت محصول (داور، یا داور هوش مصنوعی)
  capital: 100, // سرمایهٔ بیرونی جذب‌شده
  roi: 50, // بازدهی که به سرمایه‌گذارانش داده (هموارشده)
  teaser: 100, // تیزر (داور)
  community: 100, // خریداران یکتا و قلب‌ها
  portfolio: 100, // سود سهامی که اعضای تیم از سرمایه‌گذاری روی تیم‌های دیگر گرفته‌اند
  taste: 50, // سلیقه: خرید اعضا از محصولات باکیفیت
};

/** امتیاز جامعه = خریدار یکتا × این + قلب × آن */
export const COMMUNITY_POINTS = { uniqueBuyer: 15, heart: 5 };

export const AD_SLOT_KINDS = {
  BANNER: { label: "بنر بالای بازار", emoji: "🏳️" },
  FEATURED: { label: "کارت محصول ویژه", emoji: "⭐" },
  PUSH: { label: "اعلان به همه", emoji: "🔔" },
} as const;
