import { prisma } from "./db";
import { defaultConfig, scoreGame } from "./economy/engine";
import type { EconomyConfig, ScoreOutput, TeamInput, TeamResult } from "./economy/types";
import { DEFAULTS } from "./constants";
import { getSetting, getSettingInt } from "./phase";
import { cached } from "./ttl-cache";
import { PRIZES, type PrizeKey } from "./prizes";

/** پیشوند کلید کش امتیازها؛ برای invalidate("scores:") در جاهایی که امتیاز را تغییر می‌دهند استفاده می‌شود. */
const SCORES_CACHE_PREFIX = "scores:";
const SCORES_CACHE_TTL_MS = 15_000;

/** برچسب فارسی دلیل تراکنش‌های دفتر کل */
export const LEDGER_REASON_LABEL: Record<string, string> = {
  INVEST: "حمایت از ایده",
  PURCHASE: "خرید",
  AUCTION_WIN: "برد حراج",
  ADSLOT: "جایگاه تبلیغاتی",
  COIN_PURCHASE: "خرید سکه",
  ADMIN: "تنظیم برگزارکننده",
  // دلیل‌های قدیمی (پیش از بازطراحی)
  BID_HOLD: "توقیف پیشنهاد حراج",
  BID_RELEASE: "آزادسازی پیشنهاد حراج",
  DIVIDEND: "سود سهام",
  PENALTY: "جریمه",
  POWER_ANGEL: "سرمایه‌گذاری فرشته",
};

export const WALLET_LABEL: Record<string, string> = {
  BUY: "سکه",
  SEED: "کیف بذر (قدیمی)",
  TREASURY: "خزانهٔ تیم (قدیمی)",
};

/** پیکربندی امتیازدهی با اعمال مقادیر جدول Setting روی پیش‌فرض‌ها. */
export async function configFromSettings(): Promise<EconomyConfig> {
  const base = defaultConfig();
  const supportCap = await getSettingInt("support_cap", DEFAULTS.supportCap);
  return { ...base, supportCap };
}

/**
 * همهٔ داده‌های لازم برای امتیازدهی را از پایگاه‌داده جمع می‌کند
 * و به موتور خالص امتیاز (scoreGame) می‌سپارد.
 */
export async function computeScores(): Promise<ScoreOutput> {
  const config = await configFromSettings();

  const teams = await prisma.team.findMany({
    include: {
      members: { select: { id: true } },
      idea: { include: { investments: { select: { userId: true, amount: true, selfFunded: true } } } },
      product: { include: { purchases: { select: { userId: true, amount: true } } } },
    },
  });

  const teamInputs: TeamInput[] = teams.map((t) => {
    // حمایت مردمی = حمایت از ایده + خرید محصول (برندهٔ حراج هم در settleAuction یک Purchase می‌سازد).
    const supports = [
      ...(t.idea?.investments ?? []).filter((i) => !i.selfFunded).map((i) => ({ userId: i.userId, amount: i.amount })),
      ...(t.product?.purchases ?? []).map((p) => ({ userId: p.userId, amount: p.amount })),
    ];
    const p = t.product;
    return {
      teamId: t.id,
      memberIds: t.members.map((m) => m.id),
      supports,
      jury: p ? { works: p.juryWorks, value: p.juryValue, pitch: p.juryPitch } : null,
      aiQuality: p?.aiQuality ?? null,
      cheatPenalty: t.cheatPenalty,
    };
  });

  return scoreGame(config, teamInputs);
}

/**
 * نسخهٔ کش‌شدهٔ computeScores برای صفحات فقط-خواندنیِ عمومی (جدول امتیازات، نتایج پیش از تسویه و…).
 * TTL کوتاه (۱۵ ثانیه) است تا کوئری‌های سنگین روی هر بازدید تکرار نشوند.
 *
 * هشدار مهم: settleGame و پیش‌نمایش تسویهٔ ادمین باید همیشه از computeScores خام استفاده کنند
 * (نه این نسخه)، چون تسویه باید روی جدیدترین داده محاسبه شود. پس از نوشتن‌های مؤثر بر امتیاز
 * (تسویه، حمایت، خرید، داوری) با invalidate("scores:") این کش پاک می‌شود.
 */
export function computeScoresCached(): Promise<ScoreOutput> {
  return cached(SCORES_CACHE_PREFIX, SCORES_CACHE_TTL_MS, computeScores);
}

/** کلیدهای Setting برای جوایزی که داوران انتخاب می‌کنند */
export const AWARD_PICK_KEYS = { ai: "award_ai_team_id", live: "award_live_team_id" } as const;

/** انتخاب داوران برای جوایز «برترین کاربرد هوش مصنوعی» و «بهترین محصول لایو» */
export async function getAwardPicks(): Promise<{ ai: string | null; live: string | null }> {
  const [ai, live] = await Promise.all([getSetting(AWARD_PICK_KEYS.ai, ""), getSetting(AWARD_PICK_KEYS.live, "")]);
  return { ai: ai || null, live: live || null };
}

export type AwardKey = PrizeKey;

export interface Award {
  key: AwardKey;
  label: string;
  emoji: string;
  sharePct: number;
  teamId: string;
  teamName: string;
  value: number;
}

export interface AwardExtra {
  teamNames: Map<string, string>;
  /** تیم انتخاب‌شدهٔ داوران برای هر جایزهٔ انتخابی (null = هنوز انتخاب نشده) */
  picks: { ai: string | null; live: string | null };
}

/**
 * پنج جایزهٔ پایان بازی به ترتیب PRIZES؛ هر پروژه حداکثر یک جایزه می‌گیرد.
 * جوایز خودکار به نفر بعدی می‌رسند اگر نفر اول قبلاً جایزه گرفته باشد؛ جایزهٔ انتخابی داوران
 * اگر تیم انتخاب‌شده قبلاً جایزه گرفته باشد اهدا نمی‌شود (پنل داوری این را هشدار می‌دهد).
 */
export function computeAwards(output: ScoreOutput, extra: AwardExtra): Award[] {
  const awarded = new Set<string>();
  const awards: Award[] = [];
  const byId = new Map(output.teams.map((t) => [t.teamId, t]));

  const metricOf: Partial<Record<PrizeKey, (t: TeamResult) => number>> = {
    champion: (t) => t.total,
    jury: (t) => t.juryAdjusted,
    people: (t) => t.people,
  };

  for (const prize of PRIZES) {
    const give = (t: TeamResult, value: number) => {
      awards.push({
        key: prize.key,
        label: prize.label,
        emoji: prize.emoji,
        sharePct: prize.sharePct,
        teamId: t.teamId,
        teamName: extra.teamNames.get(t.teamId) ?? "",
        value,
      });
      awarded.add(t.teamId);
    };

    const metric = metricOf[prize.key];
    if (metric) {
      const sorted = [...output.teams].sort((a, b) => metric(b) - metric(a));
      for (const t of sorted) {
        // جایزه به معیار صفر تعلق نمی‌گیرد (مثلاً «انتخاب داوران» وقتی هنوز کسی داوری نشده)
        if (metric(t) <= 0) break;
        if (awarded.has(t.teamId)) continue;
        give(t, metric(t));
        break;
      }
      continue;
    }

    const pickedId = prize.key === "ai" ? extra.picks.ai : prize.key === "live" ? extra.picks.live : null;
    const picked = pickedId ? byId.get(pickedId) : undefined;
    if (picked && !awarded.has(picked.teamId)) give(picked, picked.total);
  }

  return awards;
}
