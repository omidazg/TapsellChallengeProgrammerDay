"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { DEFAULTS } from "@/lib/constants";
import { cancelCoinOrder, createCoinOrder } from "@/lib/coins";
import { fa, toEnDigits } from "@/lib/persian";
import { rateLimit, rateLimitMessage } from "@/lib/rate-limit";

/** `manual`: سفارش ثبت شد و منتظر تأیید برگزارکننده است (درایور بدون درگاه). */
export type BuyCoinsState = { error?: string; manual?: boolean; coins?: number };

const buySchema = z.object({
  coins: z.coerce
    .number({ error: "تعداد سکه را وارد کن" })
    .int("تعداد سکه باید عدد صحیح باشد")
    .min(DEFAULTS.minCoinPurchase, `حداقل خرید ${fa(DEFAULTS.minCoinPurchase)} سکه است`)
    .max(1_000_000, "تعداد سکه نامعتبر است"),
});

/** همان پیش‌فرض metadataBase در app/layout.tsx وقتی SITE_URL تنظیم نشده */
const DEFAULT_SITE_URL = "http://188.121.125.246";

/**
 * آدرس پایهٔ سایت برای بازگشت از درگاه، از SITE_URL.
 * از هدرهای Host/X-Forwarded-Host ساخته نمی‌شود: آن‌ها را درخواست‌دهنده تعیین می‌کند و
 * درگاه کاربر را به همان دامنهٔ دلخواه برمی‌گرداند (همراه authority سفارش).
 */
function siteOrigin(): string {
  const raw = process.env.SITE_URL?.trim();
  if (raw) {
    try {
      const url = new URL(raw);
      if (url.protocol === "http:" || url.protocol === "https:") return url.origin;
    } catch {
      // نامعتبر؛ پایین‌تر پیش‌فرض
    }
    console.error("[coins] SITE_URL نامعتبر است؛ از نشانی پیش‌فرض استفاده می‌شود", raw);
  }
  return process.env.NODE_ENV === "production" ? DEFAULT_SITE_URL : "http://localhost:3000";
}

/** ثبت سفارش خرید سکه و رفتن به درگاه (یا ثبت برای تأیید دستی برگزارکننده) */
export async function buyCoins(_prev: BuyCoinsState, formData: FormData): Promise<BuyCoinsState> {
  const user = await requireUser();

  const limit = rateLimit("coins:buy", user.id, { limit: 10, windowMs: 10 * 60 * 1000 });
  if (!limit.ok) return { error: rateLimitMessage(limit.retryAfterSec) };

  const parsed = buySchema.safeParse({ coins: toEnDigits(String(formData.get("coins") ?? "")).trim() });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "تعداد سکه نامعتبر است" };

  const result = await createCoinOrder(user.id, parsed.data.coins, siteOrigin());
  if (!result.ok) return { error: result.error };

  revalidatePath("/coins");
  revalidatePath("/wallet");
  // redirect بیرون از هر try/catch (خطای NEXT_REDIRECT نباید بلعیده شود)
  if (result.next.kind === "redirect") redirect(result.next.url);
  return { manual: true, coins: parsed.data.coins };
}

/** لغو سفارش در انتظار پرداخت توسط خود کاربر */
export async function cancelOrder(formData: FormData): Promise<void> {
  const user = await requireUser();
  const orderId = String(formData.get("orderId") ?? "");
  const canceled = orderId ? await cancelCoinOrder(user.id, orderId) : false;
  revalidatePath("/coins");
  redirect(canceled ? "/coins?canceled=1" : "/coins");
}
