/**
 * دادهٔ نمای سالن (/hall) — تک‌منبع برای /api/hall.
 * فقط دادهٔ عمومی: نام تیم، نیک‌نیم، اسم محصول. بدون ایمیل یا موجودی کیف پول.
 */
import { prisma } from "./db";
import { getPhase, PHASE_LABEL } from "./phase";
import { computeScoresCached } from "./scoring";
import { getSettledAt, loadSettledOutput } from "./settlement";
import { getTicker, type TickerEntry } from "./market";
import { currentOrNextAuctionId, getPublicAuctionState } from "./auction";
import { getFeedCached, type FeedEvent } from "./feed";
import { cached } from "./ttl-cache";
import type { TeamResult } from "./economy/types";

export type HallTeam = { teamId: string; name: string; logoSeed: string; metric: number };

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
  /** معیار نمایشی جدول (فروش خالص پیش از پایان بازی، امتیاز کل پس از آن) — همان قاعدهٔ صفحهٔ جدول */
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
  const settledAt = await getSettledAt();
  const closed = !!settledAt;
  const [output, teams] = await Promise.all([
    closed ? loadSettledOutput() : computeScoresCached(),
    prisma.team.findMany({ select: { id: true, name: true, logoSeed: true } }),
  ]);
  const teamMap = new Map(teams.map((t) => [t.id, t]));

  // همان قاعدهٔ صفحهٔ جدول امتیازات: پیش از پایان بازی فقط فروش خالص (عمومی)، پس از آن امتیاز کل.
  const metricOf = (t: TeamResult) => (closed ? t.total : t.netSales);
  const metricLabel = closed ? "امتیاز کل" : "فروش خالص";

  const ranked = closed
    ? [...output.teams].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
    : [...output.teams].sort((a, b) => b.netSales - a.netSales || b.hearts - a.hearts);

  const topTeams: HallTeam[] = ranked.slice(0, TOP_TEAMS_COUNT).map((t) => {
    const team = teamMap.get(t.teamId);
    return { teamId: t.teamId, name: team?.name ?? "—", logoSeed: team?.logoSeed || t.teamId, metric: metricOf(t) };
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
  const [{ phase, endsAt }, { teams, metricLabel }, auction, ticker, feed] = await Promise.all([
    getPhase(),
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
