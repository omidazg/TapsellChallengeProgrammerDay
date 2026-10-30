/**
 * دادهٔ نمای سالن (/hall) — تک‌منبع برای /api/hall.
 * فقط دادهٔ عمومی: نام تیم، نیک‌نیم، اسم محصول. بدون ایمیل یا موجودی کیف پول.
 */
import { prisma } from "./db";
import { getPhase, PHASE_LABEL } from "./phase";
import { scoresForDisplay } from "./public-scores";
import { getModuleStatuses, statusVisible } from "./module-state";
import { entryKey } from "./economy/types";
import { getTicker, type TickerEntry } from "./market";
import { currentOrNextAuctionId, getPublicAuctionState } from "./auction";
import { getFeedCached, type FeedEvent } from "./feed";
import { cached } from "./ttl-cache";

export type HallTeam = { key: string; teamId: string; name: string; productName: string; trackName: string; logoSeed: string; metric: number };

export type HallAuction = {
  id: string;
  productName: string;
  specialName: string;
  teamName: string;
  currentPrice: number;
  leaderNickname: string | null;
  endsAt: string | null;
  status: "SCHEDULED" | "LIVE" | "ENDED";
} | null;

export type HallPayload = {
  phase: string;
  phaseLabel: string;
  endsAt: string | null;
  serverNow: string;
  /** معیار نمایشی جدول: امتیاز زنده بدون داوری، و بعد از اعلام نتایج امتیاز کل — همان قاعدهٔ صفحهٔ جدول */
  metricLabel: string;
  topTeams: HallTeam[];
  auction: HallAuction;
  ticker: { recent: TickerEntry[]; volume: number };
  feed: FeedEvent[];
};

const HALL_CACHE_KEY = "hall:payload";
const HALL_CACHE_TTL_MS = 2_000;
const TOP_TEAMS_COUNT = 5;

async function buildTopTeams(): Promise<{ teams: HallTeam[]; metricLabel: string }> {
  const modules = await getModuleStatuses();
  const revealed = statusVisible(modules.results);
  const metricLabel = revealed ? "امتیاز کل" : "امتیاز زنده";
  // جدول بسته یا مخفی روی پروژکتور هم نباید دیده شود.
  if (!statusVisible(modules.leaderboard)) return { teams: [], metricLabel };

  const [{ output }, teams, tracks] = await Promise.all([
    scoresForDisplay(revealed),
    prisma.team.findMany({ select: { id: true, name: true, logoSeed: true } }),
    prisma.track.findMany({ where: { status: { not: "hidden" } }, select: { id: true, name: true } }),
  ]);
  const teamMap = new Map(teams.map((t) => [t.id, t]));
  const trackName = new Map(tracks.map((t) => [t.id, t.name]));

  // output.teams به ترتیب رتبهٔ کلی است؛ هر ثبت (تیم در یک محور) یک ردیف دارد.
  const topTeams: HallTeam[] = output.teams
    .filter((t) => trackName.has(t.trackId))
    .slice(0, TOP_TEAMS_COUNT)
    .map((t) => {
      const team = teamMap.get(t.teamId);
      return {
        key: entryKey(t),
        teamId: t.teamId,
        name: team?.name ?? "—",
        productName: t.productName,
        trackName: trackName.get(t.trackId) ?? "",
        logoSeed: team?.logoSeed || t.teamId,
        metric: t.total,
      };
    });

  return { teams: topTeams, metricLabel };
}

async function buildLiveAuction(): Promise<HallAuction> {
  const id = await currentOrNextAuctionId();
  if (!id) return null;
  const state = await getPublicAuctionState(id);
  if (!state) return null;
  // فقط حراج‌های زنده یا در صف نمایش داده می‌شود؛ حراج تمام‌شده در پنل سالن جایی ندارد.
  if (state.status === "ENDED") return null;
  return {
    id: state.id,
    productName: state.product.name,
    specialName: state.product.specialName,
    teamName: state.product.teamName,
    currentPrice: state.highest?.amount ?? state.nextMin,
    leaderNickname: state.highest?.nickname ?? null,
    endsAt: state.endsAt,
    status: state.status,
  };
}

async function buildHallPayload(): Promise<HallPayload> {
  const { phase, endsAt } = await getPhase();
  const [{ teams, metricLabel }, auction, ticker, feed] = await Promise.all([
    buildTopTeams(),
    buildLiveAuction(),
    getTicker(15),
    getFeedCached(),
  ]);

  return {
    phase,
    phaseLabel: PHASE_LABEL[phase],
    endsAt: endsAt ? endsAt.toISOString() : null,
    serverNow: new Date().toISOString(),
    metricLabel,
    topTeams: teams,
    auction,
    ticker: { recent: ticker.recent, volume: ticker.volume },
    feed,
  };
}

/** نسخهٔ کش‌شدهٔ ۲ ثانیه‌ای برای /api/hall. */
export function getHallPayloadCached(): Promise<HallPayload> {
  return cached(HALL_CACHE_KEY, HALL_CACHE_TTL_MS, buildHallPayload);
}
