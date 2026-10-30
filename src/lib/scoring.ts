import { prisma } from "./db";
import { defaultConfig, juryRawScore, scoreGame } from "./economy/engine";
import type { EconomyConfig, ScoreOutput, TeamInput } from "./economy/types";
import { entryKey } from "./economy/types";
import { DEFAULTS } from "./constants";
import { getSettingInt } from "./phase";
import { cached } from "./ttl-cache";
import { computeAwards as computeAwardsPure, type Award, type PrizeRow } from "./prizes";
import { entryCategory, parseCriteria, parseWeights, type TrackWeights } from "./tracks";

/** پیشوند کلید کش امتیازها؛ برای invalidate("scores:") در جاهایی که امتیاز را تغییر می‌دهند استفاده می‌شود. */
const SCORES_CACHE_PREFIX = "scores:";
const SCORES_CACHE_TTL_MS = 15_000;

/** برچسب فارسی دلیل تراکنش‌های دفتر کل */
export const LEDGER_REASON_LABEL: Record<string, string> = {
  INVEST: "حمایت از ایده",
  INVEST_WITHDRAW: "پس‌گرفتن حمایت از ایدهٔ ویرایش‌شده",
  PURCHASE: "خرید",
  AUCTION_WIN: "برد حراج",
  ADSLOT: "پیشنهاد جایگاه تبلیغاتی",
  COIN_PURCHASE: "خرید سکه",
  ADMIN: "تنظیم برگزارکننده",
  ADSLOT_REFUND: "بازگشت پیشنهاد جایگاه تبلیغاتی",
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

/** پیکربندی امتیازدهی با اعمال مقادیر جدول Setting و وزن‌های هر محور روی پیش‌فرض‌ها. */
export async function configFromSettings(): Promise<EconomyConfig> {
  const base = defaultConfig();
  const [supportCap, ratingMinComments, tracks] = await Promise.all([
    getSettingInt("support_cap", DEFAULTS.supportCap),
    getSettingInt("rating_min_comments", DEFAULTS.ratingMinComments),
    prisma.track.findMany({ select: { id: true, weights: true } }),
  ]);
  const trackWeights: Record<string, TrackWeights> = {};
  for (const t of tracks) trackWeights[t.id] = parseWeights(t.weights);
  return { ...base, supportCap, ratingMinComments, trackWeights };
}

function parseJson(raw: string): Record<string, unknown> {
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

/**
 * همهٔ داده‌های لازم برای امتیازدهی را از پایگاه‌داده جمع می‌کند و به موتور خالص امتیاز (scoreGame) می‌سپارد.
 * هر ترکیب تیم و محور که ایده یا محصولی دارد یک ثبت است. محور مخفی در امتیاز نیست.
 * includeJury=false برای نمایش زنده است: نمرهٔ داوری تا اعلام نتایج به شرکت‌کننده‌ها نشان داده نمی‌شود.
 */
export async function computeScores(opts: { includeJury?: boolean } = {}): Promise<ScoreOutput> {
  const includeJury = opts.includeJury ?? true;
  const config = await configFromSettings();

  // ترتیب ثابت (نه ترتیب دلخواه پایگاه‌داده)؛ رتبه‌بندی خودش هم قطعی است (compareRank).
  const [teams, tracks] = await Promise.all([
    prisma.team.findMany({
      orderBy: { id: "asc" },
      include: {
        members: { select: { id: true } },
        ideas: { include: { investments: { select: { userId: true, amount: true, selfFunded: true } } } },
        products: {
          include: {
            purchases: { select: { userId: true, amount: true } },
            juryScores: { select: { scores: true } },
            bazaarStat: true,
          },
        },
      },
    }),
    prisma.track.findMany({ select: { id: true, status: true, category: true, juryCriteria: true } }),
  ]);
  const trackById = new Map(tracks.map((t) => [t.id, t]));

  const inputs: TeamInput[] = [];
  for (const t of teams) {
    const trackIds = new Set([...t.ideas.map((i) => i.trackId), ...t.products.map((p) => p.trackId)]);
    for (const trackId of trackIds) {
      const track = trackById.get(trackId);
      if (!track || track.status === "hidden") continue;
      const idea = t.ideas.find((i) => i.trackId === trackId);
      const p = t.products.find((x) => x.trackId === trackId);
      const criteria = parseCriteria(track.juryCriteria).map((c) => c.key);
      inputs.push({
        teamId: t.id,
        trackId,
        category: entryCategory(track.category, p?.category),
        // پیش‌نویس محصول رقیب نیست: نه جایزه می‌برد و نه محور را از کم‌جمعیت بودن درمی‌آورد.
        productId: p?.submittedAt ? p.id : null,
        productName: p?.name ?? idea?.title ?? "",
        memberIds: t.members.map((m) => m.id),
        // حمایت مردمی = حمایت از ایده + خرید محصول (برندهٔ حراج هم در settleAuction یک Purchase می‌سازد).
        supports: [
          ...(idea?.investments ?? []).filter((i) => !i.selfFunded).map((i) => ({ userId: i.userId, amount: i.amount })),
          ...(p?.purchases ?? []).map((x) => ({ userId: x.userId, amount: x.amount })),
        ],
        juryRaw: includeJury && p ? juryRawScore(p.juryScores.map((j) => parseJson(j.scores)), criteria) : null,
        // ارزیابی نهایی جای بازخورد موقت را می‌گیرد.
        aiQuality: p?.aiFinal ?? p?.aiQuality ?? null,
        stats: p?.bazaarStat
          ? {
              activeInstalls: p.bazaarStat.activeInstalls,
              revenueToman: p.bazaarStat.revenueToman,
              rating: p.bazaarStat.rating,
              commentCount: p.bazaarStat.commentCount,
              flagged: p.bazaarStat.flagged,
            }
          : null,
        cheatPenalty: t.cheatPenalty,
        productSubmittedAt: p?.submittedAt ? p.submittedAt.getTime() : null,
      });
    }
  }

  return scoreGame(config, inputs);
}

/**
 * نسخهٔ کش‌شدهٔ نمایش زنده برای صفحات عمومی (جدول امتیازات و…): بدون نمرهٔ داوری.
 * TTL کوتاه (۱۵ ثانیه) است تا کوئری‌های سنگین روی هر بازدید تکرار نشوند.
 *
 * هشدار مهم: settleGame و پیش‌نمایش تسویهٔ ادمین باید همیشه از computeScores خام استفاده کنند
 * (نه این نسخه)، چون تسویه باید روی جدیدترین داده و با نمرهٔ داوری محاسبه شود. پس از نوشتن‌های مؤثر بر
 * امتیاز (تسویه، حمایت، خرید، داوری، آمار بازار) با invalidate("scores:") این کش پاک می‌شود.
 */
export function computeScoresCached(): Promise<ScoreOutput> {
  return cached(SCORES_CACHE_PREFIX, SCORES_CACHE_TTL_MS, () => computeScores({ includeJury: false }));
}

/** جوایز تعریف‌شده به ترتیب نمایش */
export async function listPrizes(): Promise<PrizeRow[]> {
  return prisma.prize.findMany({ orderBy: [{ order: "asc" }, { createdAt: "asc" }] });
}

/** برندگان جوایز از روی یک خروجی امتیاز */
export async function awardsFor(output: ScoreOutput): Promise<Award[]> {
  const [prizes, teams, minEntries, minJury] = await Promise.all([
    listPrizes(),
    prisma.team.findMany({ select: { id: true, name: true } }),
    getSettingInt("prize_min_entries", DEFAULTS.prizeMinEntries),
    getSettingInt("prize_min_jury", DEFAULTS.prizeMinJury),
  ]);
  return computeAwardsPure(output, {
    prizes,
    teamNames: new Map(teams.map((t) => [t.id, t.name])),
    minEntries,
    minJury,
  });
}

export { entryKey };
export type { Award };
