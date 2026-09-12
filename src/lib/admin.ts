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

export interface CollusionCandidate {
  teamId: string;
  otherTeamId: string;
  amountAB: number;
  amountBA: number;
}

/** تشخیص خرید متقابل مشکوک بین تیم‌ها و ثبت/به‌روزرسانی پرچم برای هر جفت مشکوک */
export async function detectAndFlagCollusion() {
  const teams = await prisma.team.findMany({ select: { id: true } });
  const purchases = await prisma.purchase.findMany({
    select: { amount: true, product: { select: { teamId: true } }, user: { select: { teamId: true } } },
  });

  const mutual = new Map<string, number>();
  for (const p of purchases) {
    const buyerTeam = p.user.teamId;
    const sellerTeam = p.product.teamId;
    if (!buyerTeam || buyerTeam === sellerTeam) continue;
    const key = `${buyerTeam}=>${sellerTeam}`;
    mutual.set(key, (mutual.get(key) ?? 0) + p.amount);
  }

  const threshold = DEFAULTS.collusionThreshold;
  const candidates: CollusionCandidate[] = [];
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      const a = teams[i].id;
      const b = teams[j].id;
      const ab = mutual.get(`${a}=>${b}`) ?? 0;
      const ba = mutual.get(`${b}=>${a}`) ?? 0;
      if (ab > 0 && ba > 0 && ab + ba >= threshold) {
        candidates.push({ teamId: a, otherTeamId: b, amountAB: ab, amountBA: ba });
      }
    }
  }

  for (const c of candidates) {
    const existing = await prisma.collusionFlag.findFirst({ where: { teamId: c.teamId, otherTeamId: c.otherTeamId } });
    if (existing) {
      await prisma.collusionFlag.update({ where: { id: existing.id }, data: { amountAB: c.amountAB, amountBA: c.amountBA } });
    } else {
      await prisma.collusionFlag.create({
        data: { teamId: c.teamId, otherTeamId: c.otherTeamId, amountAB: c.amountAB, amountBA: c.amountBA, note: "خرید متقابل مشکوک بین دو تیم" },
      });
    }
  }

  return prisma.collusionFlag.findMany({ include: { team: true }, orderBy: { createdAt: "desc" } });
}
