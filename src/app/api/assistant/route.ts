import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { askChat } from "@/lib/ai";
import { buildAssistantContext } from "@/lib/assistant-context";
import { ASSISTANT_IP_RULE, rateLimit, rateLimitMessage } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(1000),
});
const bodySchema = z.object({
  messages: z.array(messageSchema).min(1).max(12),
});

export async function POST(req: NextRequest) {
  // از همان محدودکنندهٔ مشترک پروژه استفاده می‌شود: در روز رویداد همهٔ
  // شرکت‌کننده‌ها پشت یک IP (NAT سالن) هستند و سقف ۱۰ در دقیقه عملاً
  // دستیار را برای کل سالن می‌بست.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const limited = rateLimit("assistant", ip, ASSISTANT_IP_RULE());
  if (!limited.ok) {
    return NextResponse.json(
      { error: rateLimitMessage(limited.retryAfterSec) },
      { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": String(limited.retryAfterSec) } }
    );
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
