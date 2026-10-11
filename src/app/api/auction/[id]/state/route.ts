import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { AUCTION_CACHE_PREFIX, SERVER_TIME_HEADER } from "@/lib/auction-events";
import { getPublicAuctionState } from "@/lib/auction";
import { cached } from "@/lib/ttl-cache";
import { clientIp, rateLimit, rateLimitMessage, type RateRule } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * این مسیر بدون احراز هویت است، پس شناسهٔ دلخواه نباید به ازای هر مقدار یک مدخل کش
 * (getPublicAuctionState) یا یک کوئری بسازد:
 * - شناسه‌ای که شکل cuid پریزما را ندارد فوراً ۴۰۴ می‌گیرد؛
 * - بقیه با یک مجموعهٔ کش‌شده از شناسه‌های موجود سنجیده می‌شوند (یک کلید کش برای همه؛
 *   زیر AUCTION_CACHE_PREFIX است، پس publishAuctionChange — که پس از ساخت/حذف حراج صدا
 *   زده می‌شود — آن را هم باطل می‌کند).
 */
const CUID_RE = /^c[a-z0-9]{20,31}$/; // @default(cuid()) → ۲۵ نویسه
const IDS_KEY = `${AUCTION_CACHE_PREFIX}ids`;
const IDS_TTL_MS = 30_000;

/**
 * کل سالن پشت یک IP است و هر کلاینت در حالت polling هر ۲ ثانیه یک درخواست می‌زند
 * (AuctionStage، POLL_MS)؛ این سقف فقط جلوی سیل غیرعادی را می‌گیرد.
 */
function stateIpRule(): RateRule {
  const n = Number(process.env.AUCTION_STATE_IP_RATE);
  return { limit: Number.isFinite(n) && n > 0 ? Math.floor(n) : 1000, windowMs: 10_000 };
}

function notFound() {
  return NextResponse.json({ error: "حراج پیدا نشد" }, { status: 404, headers: { "Cache-Control": "no-store" } });
}

function auctionIds(): Promise<Set<string>> {
  return cached(IDS_KEY, IDS_TTL_MS, async () => {
    const rows = await prisma.auction.findMany({ select: { id: true } });
    return new Set(rows.map((r) => r.id));
  });
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!CUID_RE.test(id)) return notFound();

  const rl = rateLimit("auction-state", await clientIp(), stateIpRule());
  if (!rl.ok) {
    return NextResponse.json(
      { error: rateLimitMessage(rl.retryAfterSec) },
      { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": String(rl.retryAfterSec) } }
    );
  }

  if (!(await auctionIds()).has(id)) return notFound();

  // فقط دادهٔ عمومی حراج، با کش مشترک ~۱ ثانیه‌ای؛ تسویهٔ حراج‌های تمام‌شده هم داخل همین تابع است.
  const state = await getPublicAuctionState(id);
  if (!state) return notFound();
  return NextResponse.json(state, { headers: { "Cache-Control": "no-store", [SERVER_TIME_HEADER]: String(Date.now()) } });
}
