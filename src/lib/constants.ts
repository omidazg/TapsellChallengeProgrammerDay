/** ثابت‌های بازی — قابل بازنویسی از جدول Setting در پنل برگزارکننده */

export const ROLES = {
  BUILDER: { label: "سازنده", desc: "محصول را می‌سازد: کد، نمونهٔ اولیه، دمو.", emoji: "🛠️" },
  STORYTELLER: { label: "قصه‌گو", desc: "تیزر، تصاویر، متن معرفی و صفحهٔ محصول.", emoji: "🎬" },
  DEALMAKER: { label: "معامله‌گر", desc: "قیمت‌گذاری، جذب سرمایه، حراج.", emoji: "🤝" },
} as const;
export type RoleKey = keyof typeof ROLES;

export const POWERS = {
  HYPE: { label: "هیاهو", desc: "نیم ساعت جایگاه «محصول ویژه» رایگان در روز بازار.", emoji: "📣" },
  BARGAIN: { label: "چانه‌زنی", desc: "ده درصد تخفیف روی یک خرید.", emoji: "🏷️" },
  ANGEL: { label: "فرشته", desc: "۲۰ سکهٔ بذر اضافه، به شرط سرمایه‌گذاری روی کم‌سرمایه‌ترین ایده.", emoji: "👼" },
  SECOND_WIND: { label: "نفس دوم", desc: "دو دقیقه تمدید یک حراج زنده.", emoji: "⏱️" },
  INSIDER: { label: "خبرچین", desc: "دیدن فهرست سرمایه‌گذاران یک تیم پیش از عمومی شدن.", emoji: "🕵️" },
  SHIELD: { label: "سپر", desc: "حذف جریمهٔ ۱۰ سکهٔ خرج‌نشده.", emoji: "🛡️" },
} as const;
export type PowerKey = keyof typeof POWERS;

export const DEFAULTS = {
  seedWallet: 100,
  buyWallet: 100,
  maxPerTarget: 40, // سقف سرمایه‌گذاری/خرید روی یک هدف
  penaltyPerCoin: 1,
  minPrice: 5,
  maxPrice: 50,
  minRevenueShare: 20,
  maxRevenueShare: 60,
  bidIncrement: 2,
  antiSnipeWindowSec: 30,
  antiSnipeExtendSec: 60,
  auctionDurationSec: 300,
  collusionThreshold: 60, // مجموع خرید متقابل بین دو تیم
};

export const SCORE_WEIGHTS = {
  sales: 350,
  quality: 200,
  capital: 150,
  roi: 100,
  teaser: 100,
  community: 100,
};

export const AD_SLOT_KINDS = {
  BANNER: { label: "بنر بالای بازار", emoji: "🏳️" },
  FEATURED: { label: "کارت محصول ویژه", emoji: "⭐" },
  PUSH: { label: "اعلان به همه", emoji: "🔔" },
} as const;
