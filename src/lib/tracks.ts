/**
 * محورهای مسابقه: انواع، وزن‌ها و معیارهای پیش‌فرض — بدون وابستگی به دیتابیس.
 * دسترسی به داده در ./track-data.ts است.
 */
export type TrackKind = "PRODUCT" | "CONTENT" | "OS";
export type TrackCategory = "TECH" | "NON_TECH" | "MIXED";
export type EntryCategory = "TECH" | "NON_TECH";

export const ENTRY_CATEGORY_LABEL: Record<EntryCategory, string> = {
  TECH: "فنی",
  NON_TECH: "غیرفنی",
};

export const TRACK_KIND_LABEL: Record<TrackKind, string> = {
  PRODUCT: "ساخت محصول",
  CONTENT: "تولید محتوا",
  OS: "راهکار OS",
};

/** سهم هر زیرشاخص از بخش بازار (درصد؛ جمع ۱۰۰) */
export type MarketSubWeights = {
  support: number;
  activeInstalls: number;
  revenue: number;
  rating: number;
  comments: number;
};

/** سهم سه بخش اصلی امتیاز (درصد؛ جمع ۱۰۰) */
export type TrackWeights = {
  ai: number;
  market: number;
  jury: number;
  marketSub: MarketSubWeights;
};

export const MARKET_SUB_LABEL: Record<keyof MarketSubWeights, string> = {
  support: "حمایت با سکه",
  activeInstalls: "نصب فعال",
  revenue: "درآمد واقعی",
  rating: "امتیاز ستاره‌ای",
  comments: "تعداد نظر",
};

/** ۳۰٪ هوش مصنوعی، ۳۰٪ بازار (یک‌پنجم آن حمایت با سکه)، ۴۰٪ داوری */
export const DEFAULT_WEIGHTS: TrackWeights = {
  ai: 30,
  market: 30,
  jury: 40,
  marketSub: { support: 20, activeInstalls: 33, revenue: 24, rating: 14, comments: 9 },
};

/**
 * محورهایی که روی بازار منتشر نمی‌شوند: بخش آمار بازار (۲۴٪) بین هوش مصنوعی و داوری پخش می‌شود
 * و فقط حمایت با سکه (۶٪) می‌ماند.
 */
export const NO_BAZAAR_WEIGHTS: TrackWeights = {
  ai: 42,
  market: 6,
  jury: 52,
  marketSub: { support: 100, activeInstalls: 0, revenue: 0, rating: 0, comments: 0 },
};

export type JuryCriterion = { key: string; label: string };

/** معیارهای پیش‌فرض داوری تا تصمیم کمیته؛ برای هر محور در پنل قابل تغییر است. */
export const DEFAULT_JURY_CRITERIA: JuryCriterion[] = [
  { key: "works", label: "آیا واقعاً کار می‌کند؟" },
  { key: "value", label: "ارزش واقعی برای کاربر یا گروه پگاه" },
  { key: "pitch", label: "تیزر و ارائه" },
];

function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : fallback;
}

/** خواندن امن وزن‌های ذخیره‌شده؛ مقدار خراب یا ناقص با پیش‌فرض پر می‌شود. */
export function parseWeights(raw: string | null | undefined, fallback: TrackWeights = DEFAULT_WEIGHTS): TrackWeights {
  let o: Partial<TrackWeights> & { marketSub?: Partial<MarketSubWeights> } = {};
  try {
    const parsed = JSON.parse(raw || "{}");
    if (parsed && typeof parsed === "object") o = parsed;
  } catch {
    // مقدار خراب: پیش‌فرض
  }
  const sub: Partial<MarketSubWeights> = o.marketSub ?? {};
  return {
    ai: num(o.ai, fallback.ai),
    market: num(o.market, fallback.market),
    jury: num(o.jury, fallback.jury),
    marketSub: {
      support: num(sub.support, fallback.marketSub.support),
      activeInstalls: num(sub.activeInstalls, fallback.marketSub.activeInstalls),
      revenue: num(sub.revenue, fallback.marketSub.revenue),
      rating: num(sub.rating, fallback.marketSub.rating),
      comments: num(sub.comments, fallback.marketSub.comments),
    },
  };
}

/** معیارهای داوری ذخیره‌شده؛ در نبود مقدار معتبر، پیش‌فرض. */
export function parseCriteria(raw: string | null | undefined): JuryCriterion[] {
  try {
    const parsed = JSON.parse(raw || "[]");
    if (Array.isArray(parsed)) {
      const list = parsed.filter(
        (c): c is JuryCriterion => !!c && typeof c.key === "string" && !!c.key && typeof c.label === "string" && !!c.label
      );
      if (list.length > 0) return list;
    }
  } catch {
    // مقدار خراب: پیش‌فرض
  }
  return DEFAULT_JURY_CRITERIA;
}

/** دستهٔ فنی/غیرفنی یک ثبت: محور MIXED از انتخاب تیم، بقیه از خود محور. */
export function entryCategory(trackCategory: string, productCategory: string | null | undefined): EntryCategory | "" {
  if (trackCategory === "TECH" || trackCategory === "NON_TECH") return trackCategory;
  return productCategory === "TECH" || productCategory === "NON_TECH" ? productCategory : "";
}
