/**
 * کش کوتاه‌مدت در حافظهٔ همین پردازه (سرور تک‌نمونه‌ای است).
 * هدف: وقتی N کاربر هم‌زمان یک داده را می‌پرسند، فقط یک کوئری به دیتابیس برود.
 *
 * - درخواست‌های هم‌زمان روی یک کلید، یک Promise مشترک می‌گیرند (بدون stampede).
 * - اگر loader خطا بدهد، چیزی کش نمی‌شود و درخواست بعدی دوباره تلاش می‌کند.
 * - invalidate(prefix) همهٔ کلیدهایی را که با آن پیشوند شروع می‌شوند پاک می‌کند.
 */
type Entry = { expires: number; value: Promise<unknown> };

type CacheGlobal = typeof globalThis & { __arenaTtlCache?: Map<string, Entry> };
const g = globalThis as CacheGlobal;
const store: Map<string, Entry> = (g.__arenaTtlCache ??= new Map());

export function cached<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && hit.expires > now) return hit.value as Promise<T>;

  const value = loader();
  store.set(key, { expires: now + ttlMs, value });
  value.catch(() => {
    if (store.get(key)?.value === value) store.delete(key);
  });
  return value;
}

export function invalidate(prefix = ""): void {
  for (const key of store.keys()) if (key.startsWith(prefix)) store.delete(key);
}
