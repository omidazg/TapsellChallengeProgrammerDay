"use server";

import { z } from "zod";
import { headers } from "next/headers";
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

/**
 * آدرس پایهٔ سایت برای بازگشت از درگاه، از روی هدرهای همین درخواست.
 * پشت Caddy هدرهای X-Forwarded-Proto/Host تنظیم می‌شوند؛ بدون پروکسی، Next خودش HTTP ساده سرو می‌کند.
 */
async function requestOrigin(): Promise<string> {
  const h = await headers();
  const first = (v: string | null) => (v ?? "").split(",")[0].trim();
  const host = first(h.get("x-forwarded-host")) || first(h.get("host"));
  if (!host) return (process.env.SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const proto = first(h.get("x-forwarded-proto")) || "http";
  return `${proto}://${host}`;
}

/** ثبت سفارش خرید سکه و رفتن به درگاه (یا ثبت برای تأیید دستی برگزارکننده) */
export async function buyCoins(_prev: BuyCoinsState, formData: FormData): Promise<BuyCoinsState> {
  const user = await requireUser();

  const limit = rateLimit("coins:buy", user.id, { limit: 10, windowMs: 10 * 60 * 1000 });
  if (!limit.ok) return { error: rateLimitMessage(limit.retryAfterSec) };

  const parsed = buySchema.safeParse({ coins: toEnDigits(String(formData.get("coins") ?? "")).trim() });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "تعداد سکه نامعتبر است" };

  const result = await createCoinOrder(user.id, parsed.data.coins, await requestOrigin());
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
