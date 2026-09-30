import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { askChat } from "@/lib/ai";
import { getCurrentUser } from "@/lib/auth";
import { buildAssistantContext } from "@/lib/assistant-context";
import { getEffectiveGameValues } from "@/lib/game-values";
import { ASSISTANT_IP_RULE, rateLimit, rateLimitMessage } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(1000),
});
const bodySchema = z.object({
  messages: z.array(messageSchema).min(1).max(12),
});

/**
 * سقف per-user: بودجهٔ روزانهٔ هوش مصنوعی بین دستیار و بقیهٔ قابلیت‌ها (داوری، بررسی
 * سرمایه‌گذاری) مشترک است؛ بدون این سقف یک نفر (یا یک اسکریپت) می‌تواند کل بودجه را
 * در چند دقیقه تمام کند.
 */
const ASSISTANT_USER_RATE = { limit: 30, windowMs: 10 * 60 * 1000 };

export async function POST(req: NextRequest) {
  // فقط کاربران واردشده: مسیر ناشناس یعنی هر کسی از اینترنت می‌توانست بودجهٔ مشترک را بسوزاند.
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "برای پرسیدن از دستیار اول وارد حساب شو؛ تا آن موقع راهنمای بازی (/guide) در دسترس است." },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

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

  const userLimited = rateLimit("assistant-user", user.id, ASSISTANT_USER_RATE);
  if (!userLimited.ok) {
    return NextResponse.json(
      { error: rateLimitMessage(userLimited.retryAfterSec) },
      { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": String(userLimited.retryAfterSec) } }
    );
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "پیام نامعتبر است." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  // مقادیر مؤثر بازی (تنظیم برگزارکننده یا پیش‌فرض) تا پاسخ دستیار با قوانین واقعی یکی باشد
  // کلاینت پیام خوشامد (نقش assistant) را هم در ابتدای تاریخچه می‌فرستد و بعد از برش
  // slice(-12) هم ممکن است تاریخچه با assistant شروع شود؛ API باید با پیام کاربر شروع
  // و تمام شود (پیام آخر assistant یعنی prefill که مدل‌های جدید رد می‌کنند و 503 می‌شد).
  const messages = parsed.data.messages;
  const firstUser = messages.findIndex((m) => m.role === "user");
  if (firstUser === -1 || messages[messages.length - 1].role !== "user") {
    return NextResponse.json({ error: "پیام نامعتبر است." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const reply = await askChat(buildAssistantContext(await getEffectiveGameValues()), messages.slice(firstUser), 600);
  if (!reply) {
    return NextResponse.json(
      { error: "دستیار هوش مصنوعی الان در دسترس نیست؛ سؤالت را از برگزارکننده بپرس یا راهنمای بازی (/guide) را ببین." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  return NextResponse.json({ reply }, { headers: { "Cache-Control": "no-store" } });
}
