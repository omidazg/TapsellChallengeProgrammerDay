import { prisma } from "./db";
import { DEFAULTS } from "./constants";

/** شمارش‌های داشبورد برگزارکننده */
export async function getAdminCounts() {
  const [users, teams, ideasSubmitted, productsSubmitted, purchasesAgg] = await Promise.all([
    prisma.user.count(),
    prisma.team.count(),
    prisma.idea.count({ where: { submittedAt: { not: null } } }),
    prisma.product.count({ where: { submittedAt: { not: null } } }),
    prisma.purchase.aggregate({ _sum: { amount: true }, _count: true }),
  ]);
  return {
    users,
    teams,
    ideasSubmitted,
    productsSubmitted,
    purchasesCount: purchasesAgg._count,
    purchasesVolume: purchasesAgg._sum.amount ?? 0,
  };
}

export const SETTING_KEYS = [
  "starting_coins",
  "support_cap",
  "max_bought_coins_per_user",
  "bid_increment",
  "auction_duration_sec",
  "adslot_price_banner",
  "adslot_price_featured",
  "adslot_price_push",
  "adslot_max_per_team",
  "adslot_hours",
  "market_starts_at",
  "rating_min_comments",
  "prize_min_entries",
  "prize_min_jury",
] as const;
export type SettingKey = (typeof SETTING_KEYS)[number];

export const SETTING_LABELS: Record<SettingKey, string> = {
  starting_coins: "سکهٔ رایگان اولیهٔ هر نفر",
  support_cap: "سقف اثر هر نفر روی حمایت مردمی یک پروژه (سکه)",
  max_bought_coins_per_user: "سقف خرید سکه برای هر نفر",
  bid_increment: "حداقل افزایش پیشنهاد حراج",
  auction_duration_sec: "مدت هر حراج (ثانیه)",
  adslot_price_banner: "کمترین پیشنهاد بنر بالای بازار (سکه)",
  adslot_price_featured: "کمترین پیشنهاد کارت محصول ویژه (سکه)",
  adslot_price_push: "کمترین پیشنهاد اعلان به همه (سکه)",
  adslot_max_per_team: "سقف جایگاه تبلیغاتی هر تیم",
  adslot_hours: "طول هر بازهٔ جایگاه تبلیغاتی (ساعت)",
  market_starts_at: "زمان شروع نخستین جایگاه تبلیغاتی",
  rating_min_comments: "حداقل تعداد نظر برای حساب‌شدن امتیاز ستاره‌ای",
  prize_min_entries: "حداقل ثبت در یک جایزه (کمتر از این، حداقل نمرهٔ داوری لازم است)",
  prize_min_jury: "حداقل نمرهٔ داوری برای جایزه با شرکت‌کنندهٔ کم (۰ تا ۱۰۰)",
};

const SETTING_DEFAULTS: Record<SettingKey, string> = {
  starting_coins: String(DEFAULTS.startingCoins),
  support_cap: String(DEFAULTS.supportCap),
  max_bought_coins_per_user: String(DEFAULTS.maxBoughtCoinsPerUser),
  bid_increment: String(DEFAULTS.bidIncrement),
  auction_duration_sec: String(DEFAULTS.auctionDurationSec),
  adslot_price_banner: String(DEFAULTS.adslotPriceBanner),
  adslot_price_featured: String(DEFAULTS.adslotPriceFeatured),
  adslot_price_push: String(DEFAULTS.adslotPricePush),
  adslot_max_per_team: String(DEFAULTS.adslotMaxPerTeam),
  adslot_hours: String(DEFAULTS.adslotHours),
  market_starts_at: "",
  rating_min_comments: String(DEFAULTS.ratingMinComments),
  prize_min_entries: String(DEFAULTS.prizeMinEntries),
  prize_min_jury: String(DEFAULTS.prizeMinJury),
};

/** مقادیر جاری تنظیمات قابل‌تغییر بازی، با مقدار پیش‌فرض در نبود ردیف */
export async function getSettingsMap(): Promise<Record<SettingKey, string>> {
  const rows = await prisma.setting.findMany({ where: { key: { in: [...SETTING_KEYS] } } });
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const out = {} as Record<SettingKey, string>;
  for (const key of SETTING_KEYS) out[key] = map[key] ?? SETTING_DEFAULTS[key];
  return out;
}

/** دلیل‌های دفتر کل که یعنی کسی سکه خرج کرده است؛ از اولین خرج، کلیدهای اقتصادی قفل می‌شوند. */
const SPEND_REASONS = ["INVEST", "PURCHASE", "ADSLOT", "AUCTION_WIN"];

/** آیا تنظیمات اقتصادی قفل است؟ (دفتر کل دست‌کم یک خرج سکه دارد) */
export async function areEconomySettingsLocked(): Promise<boolean> {
  return (await prisma.ledgerEntry.count({ where: { reason: { in: SPEND_REASONS } } })) > 0;
}

export async function setSetting(key: string, value: string) {
  await prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
}

/**
 * تنظیمات زمان‌بند خودکار (src/lib/scheduler.ts).
 * از SETTING_KEYS بالا جدا نگه داشته شده چون `updateSettingsAction` در actions.ts
 * (که مالک آن تیم دیگری است) مجموعهٔ کلیدهای بالا را با zod ثابت اعتبارسنجی می‌کند؛
 * این کلیدها با سرور-اکشن مستقل خودشان (scheduler-actions.ts) ذخیره می‌شوند.
 */
export const SCHEDULER_SETTING_KEYS = ["auto_auction", "auction_gap_sec"] as const;
export type SchedulerSettingKey = (typeof SCHEDULER_SETTING_KEYS)[number];

export const SCHEDULER_SETTING_LABELS: Record<SchedulerSettingKey, string> = {
  auto_auction: "شروع خودکار حراج بعدیِ صف (وقتی بازار باز است)",
  auction_gap_sec: "فاصلهٔ شروع حراج بعدی (ثانیه)",
};

export const SCHEDULER_SETTING_KINDS: Record<SchedulerSettingKey, "boolean" | "number"> = {
  auto_auction: "boolean",
  auction_gap_sec: "number",
};

const SCHEDULER_SETTING_DEFAULTS: Record<SchedulerSettingKey, string> = {
  auto_auction: "1",
  auction_gap_sec: "60",
};

/** مقادیر جاری تنظیمات زمان‌بند، با مقدار پیش‌فرض در نبود ردیف */
export async function getSchedulerSettingsMap(): Promise<Record<SchedulerSettingKey, string>> {
  const rows = await prisma.setting.findMany({ where: { key: { in: [...SCHEDULER_SETTING_KEYS] } } });
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const out = {} as Record<SchedulerSettingKey, string>;
  for (const key of SCHEDULER_SETTING_KEYS) out[key] = map[key] ?? SCHEDULER_SETTING_DEFAULTS[key];
  return out;
}

export interface CollusionCandidate {
  teamId: string;
  otherTeamId: string;
  amountAB: number;
  amountBA: number;
}

/**
 * تشخیص خرید/حمایت متقابل مشکوک بین تیم‌ها و ثبت/به‌روزرسانی پرچم برای هر جفت مشکوک.
 *
 * هم خریدهای بازار و هم سرمایه‌گذاری‌های بیرونی (غیر خودتأمین — از وقتی خودتأمینی
 * ممنوع شده، عملاً همهٔ سرمایه‌گذاری‌ها بیرونی‌اند) را به‌عنوان «جریان خرج از تیم A
 * به تیم B» جمع می‌زند. جفت (A,B) فقط وقتی پرچم می‌خورد که:
 *   ۱) جریان هر دو طرف مثبت باشد (ab>0 و ba>0)،
 *   ۲) مجموع دو جریان از آستانه بگذرد (ab+ba ≥ collusionThreshold)، و
 *   ۳) برای هر طرف، جریانش به سمت دیگری دست‌کم collusionShare از کل خرج بیرونی‌اش باشد
 *      (ab ≥ collusionShare×spendA و ba ≥ collusionShare×spendB) — یعنی واقعاً روی هم
 *      متمرکز شده باشند، نه اینکه هر دو صرفاً پرخرج بوده باشند.
 */
export async function detectAndFlagCollusion() {
  const teams = await prisma.team.findMany({ select: { id: true } });
  const [purchases, investments] = await Promise.all([
    prisma.purchase.findMany({
      select: { amount: true, product: { select: { teamId: true } }, user: { select: { teamId: true } } },
    }),
    prisma.investment.findMany({
      where: { selfFunded: false },
      select: { amount: true, idea: { select: { teamId: true } }, user: { select: { teamId: true } } },
    }),
  ]);

  // جریان جفتی خرج A→B، و مجموع خرج بیرونی هر تیم (صرف‌نظر از اینکه به کدام تیم رفته)
  const mutual = new Map<string, number>();
  const spend = new Map<string, number>();
  function addFlow(buyerTeam: string | null, sellerTeam: string, amount: number) {
    if (!buyerTeam || buyerTeam === sellerTeam) return;
    const key = `${buyerTeam}=>${sellerTeam}`;
    mutual.set(key, (mutual.get(key) ?? 0) + amount);
    spend.set(buyerTeam, (spend.get(buyerTeam) ?? 0) + amount);
  }
  for (const p of purchases) addFlow(p.user.teamId, p.product.teamId, p.amount);
  for (const i of investments) addFlow(i.user.teamId, i.idea.teamId, i.amount);

  const threshold = DEFAULTS.collusionThreshold;
  const share = DEFAULTS.collusionShare;
  const candidates: CollusionCandidate[] = [];
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      const a = teams[i].id;
      const b = teams[j].id;
      const ab = mutual.get(`${a}=>${b}`) ?? 0;
      const ba = mutual.get(`${b}=>${a}`) ?? 0;
      if (ab <= 0 || ba <= 0 || ab + ba < threshold) continue;
      const spendA = spend.get(a) ?? 0;
      const spendB = spend.get(b) ?? 0;
      if (ab < share * spendA || ba < share * spendB) continue;
      candidates.push({ teamId: a, otherTeamId: b, amountAB: ab, amountBA: ba });
    }
  }

  for (const c of candidates) {
    const existing = await prisma.collusionFlag.findFirst({ where: { teamId: c.teamId, otherTeamId: c.otherTeamId } });
    if (existing) {
      await prisma.collusionFlag.update({ where: { id: existing.id }, data: { amountAB: c.amountAB, amountBA: c.amountBA } });
    } else {
      await prisma.collusionFlag.create({
        data: {
          teamId: c.teamId,
          otherTeamId: c.otherTeamId,
          amountAB: c.amountAB,
          amountBA: c.amountBA,
          note: "خرید/حمایت متقابل مشکوک بین دو تیم",
        },
      });
    }
  }

  return prisma.collusionFlag.findMany({ include: { team: true }, orderBy: { createdAt: "desc" } });
}
