import { headers } from "next/headers";

/**
 * محدودیت نرخ با پنجرهٔ لغزان، در حافظهٔ همان پردازه.
 * سرور تک‌پردازه‌ای است (مثل ttl-cache.ts)، پس نیازی به Redis نیست؛
 * با ری‌استارت شمارنده‌ها صفر می‌شوند که برای این کاربرد اشکالی ندارد.
 */

export type RateRule = { limit: number; windowMs: number };
export type RateResult = { ok: true } | { ok: false; retryAfterSec: number };

type Store = Map<string, number[]>;
type RateGlobal = typeof globalThis & { __arenaRateLimit?: { store: Store; lastPrune: number } };
const g = globalThis as RateGlobal;
const state = (g.__arenaRateLimit ??= { store: new Map(), lastPrune: Date.now() });

const PRUNE_EVERY_MS = 60_000;
const MAX_WINDOW_MS = 60 * 60 * 1000; // پنجره‌های بلندتر از یک ساعت پشتیبانی نمی‌شوند

function prune(now: number) {
  if (now - state.lastPrune < PRUNE_EVERY_MS) return;
  state.lastPrune = now;
  for (const [k, times] of state.store) {
    if (times.length === 0 || now - times[times.length - 1] > MAX_WINDOW_MS) state.store.delete(k);
  }
}

/**
 * یک برخورد برای `bucket:key` ثبت می‌کند، مگر اینکه سقف پر باشد.
 * برخوردهای ردشده شمرده نمی‌شوند تا کاربر با تلاش‌های پیاپی بیشتر قفل نشود.
 */
export function rateLimit(bucket: string, key: string, rule: RateRule): RateResult {
  const now = Date.now();
  prune(now);
  const id = `${bucket}:${key}`;
  const recent = (state.store.get(id) ?? []).filter((t) => now - t < rule.windowMs);
  if (recent.length >= rule.limit) {
    state.store.set(id, recent);
    const retryAfterSec = Math.max(1, Math.ceil((recent[0] + rule.windowMs - now) / 1000));
    return { ok: false, retryAfterSec };
  }
  recent.push(now);
  state.store.set(id, recent);
  return { ok: true };
}

/** پیام فارسی استاندارد برای پاسخ ردشده */
export function rateLimitMessage(retryAfterSec: number): string {
  if (retryAfterSec < 60) return `تعداد درخواست‌ها زیاد است؛ ${retryAfterSec} ثانیهٔ دیگر دوباره تلاش کن.`;
  return `تعداد درخواست‌ها زیاد است؛ حدود ${Math.ceil(retryAfterSec / 60)} دقیقهٔ دیگر دوباره تلاش کن.`;
}

/**
 * IP کلاینت. Caddy هدر X-Forwarded-For را با IP واقعی بازنویسی می‌کند
 * (بدون trusted_proxies مقدار ارسالی کاربر را نگه نمی‌دارد)، پس اولین مقدار قابل اعتماد است.
 */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const xff = h.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return h.get("x-real-ip") ?? "local";
}

/** فقط برای تست‌ها */
export function resetRateLimits() {
  state.store.clear();
}
