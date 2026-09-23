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
  "seed_wallet",
  "buy_wallet",
  "max_per_target",
  "penalty_per_coin",
  "bid_increment",
  "auction_duration_sec",
  "market_starts_at",
] as const;
export type SettingKey = (typeof SETTING_KEYS)[number];

export const SETTING_LABELS: Record<SettingKey, string> = {
  seed_wallet: "کیف بذر اولیه",
  buy_wallet: "کیف خرید اولیه",
  max_per_target: "سقف سرمایه‌گذاری/خرید روی یک هدف",
  penalty_per_coin: "جریمهٔ هر سکهٔ خرج‌نشده",
  bid_increment: "حداقل افزایش پیشنهاد حراج",
  auction_duration_sec: "مدت هر حراج (ثانیه)",
  market_starts_at: "زمان شروع روز بازار",
};

const SETTING_DEFAULTS: Record<SettingKey, string> = {
  seed_wallet: String(DEFAULTS.seedWallet),
  buy_wallet: String(DEFAULTS.buyWallet),
  max_per_target: String(DEFAULTS.maxPerTarget),
  penalty_per_coin: String(DEFAULTS.penaltyPerCoin),
  bid_increment: String(DEFAULTS.bidIncrement),
  auction_duration_sec: String(DEFAULTS.auctionDurationSec),
  market_starts_at: "",
};

/** مقادیر جاری تنظیمات قابل‌تغییر بازی، با مقدار پیش‌فرض در نبود ردیف */
export async function getSettingsMap(): Promise<Record<SettingKey, string>> {
  const rows = await prisma.setting.findMany({ where: { key: { in: [...SETTING_KEYS] } } });
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const out = {} as Record<SettingKey, string>;
  for (const key of SETTING_KEYS) out[key] = map[key] ?? SETTING_DEFAULTS[key];
  return out;
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
export const SCHEDULER_SETTING_KEYS = [
  "auto_advance",
  "auto_auction",
  "auction_gap_sec",
  "phase_hours_IDEATION",
  "phase_hours_SEED_ROUND",
  "phase_hours_BUILD",
  "phase_hours_MARKET",
  "phase_hours_AUCTION",
] as const;
export type SchedulerSettingKey = (typeof SCHEDULER_SETTING_KEYS)[number];

export const SCHEDULER_SETTING_LABELS: Record<SchedulerSettingKey, string> = {
  auto_advance: "پیشروی خودکار فاز",
  auto_auction: "شروع خودکار حراج بعدی",
  auction_gap_sec: "فاصلهٔ شروع حراج بعدی (ثانیه)",
  phase_hours_IDEATION: "مدت فاز اتاق ایده (ساعت)",
  phase_hours_SEED_ROUND: "مدت فاز دور سرمایه‌گذاری (ساعت)",
  phase_hours_BUILD: "مدت فاز ساخت (ساعت)",
  phase_hours_MARKET: "مدت فاز روز بازار (ساعت)",
  phase_hours_AUCTION: "مدت فاز حراج زنده (ساعت)",
};

export const SCHEDULER_SETTING_KINDS: Record<SchedulerSettingKey, "boolean" | "number"> = {
  auto_advance: "boolean",
  auto_auction: "boolean",
  auction_gap_sec: "number",
  phase_hours_IDEATION: "number",
  phase_hours_SEED_ROUND: "number",
  phase_hours_BUILD: "number",
  phase_hours_MARKET: "number",
  phase_hours_AUCTION: "number",
};

const SCHEDULER_SETTING_DEFAULTS: Record<SchedulerSettingKey, string> = {
  auto_advance: "0",
  auto_auction: "0",
  auction_gap_sec: "60",
  phase_hours_IDEATION: "24",
  phase_hours_SEED_ROUND: "24",
  phase_hours_BUILD: "48",
  phase_hours_MARKET: "6",
  phase_hours_AUCTION: "2",
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
 * تشخیص خرید/سرمایه‌گذاری متقابل مشکوک بین تیم‌ها و ثبت/به‌روزرسانی پرچم برای هر جفت مشکوک.
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
          note: "خرید/سرمایه‌گذاری متقابل مشکوک بین دو تیم",
        },
      });
    }
  }

  return prisma.collusionFlag.findMany({ include: { team: true }, orderBy: { createdAt: "desc" } });
}
