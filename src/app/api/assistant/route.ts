import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { askChat } from "@/lib/ai";
import { buildAssistantContext } from "@/lib/assistant-context";

export const dynamic = "force-dynamic";

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(1000),
});
const bodySchema = z.object({
  messages: z.array(messageSchema).min(1).max(12),
});

// محدودیت نرخ سادهٔ در-حافظه: هر IP حداکثر ۱۰ پیام در دقیقه (سرور تک‌نمونه‌ای است).
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;
type RateGlobal = typeof globalThis & { __assistantRate?: Map<string, { count: number; resetAt: number }> };
const g = globalThis as RateGlobal;
const rateStore: Map<string, { count: number; resetAt: number }> = (g.__assistantRate ??= new Map());

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateStore.get(ip);
  if (!entry || entry.resetAt <= now) {
    rateStore.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: "درخواست زیاد؛ کمی صبر کن و دوباره بپرس." }, { status: 429, headers: { "Cache-Control": "no-store" } });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "پیام نامعتبر است." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const reply = await askChat(buildAssistantContext(), parsed.data.messages, 600);
  if (!reply) {
    return NextResponse.json(
      { error: "دستیار هوش مصنوعی الان در دسترس نیست؛ سؤالت را از برگزارکننده بپرس یا راهنمای بازی (/guide) را ببین." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  return NextResponse.json({ reply }, { headers: { "Cache-Control": "no-store" } });
}
