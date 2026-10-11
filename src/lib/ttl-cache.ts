/**
 * کش کوتاه‌مدت در حافظهٔ همین پردازه (سرور تک‌نمونه‌ای است).
 * هدف: وقتی N کاربر هم‌زمان یک داده را می‌پرسند، فقط یک کوئری به دیتابیس برود.
 *
 * - درخواست‌های هم‌زمان روی یک کلید، یک Promise مشترک می‌گیرند (بدون stampede).
 * - اگر loader خطا بدهد، چیزی کش نمی‌شود و درخواست بعدی دوباره تلاش می‌کند.
 * - invalidate(prefix) همهٔ کلیدهایی را که با آن پیشوند شروع می‌شوند پاک می‌کند.
 * - حافظه محدود است: مدخل‌های منقضی به‌صورت تنبل (هنگام خواندن، و هر چند ثانیه یک‌بار
 *   هنگام نوشتن) پاک می‌شوند و تعداد مدخل‌ها هرگز از MAX_ENTRIES بیشتر نمی‌شود؛ در
 *   صورت پر شدن، قدیمی‌ترین مدخل (به ترتیب درج در Map) بیرون می‌رود.
 */
type Entry = { expires: number; value: Promise<unknown> };

type CacheGlobal = typeof globalThis & { __arenaTtlCache?: Map<string, Entry>; __arenaTtlCacheSweep?: number };
const g = globalThis as CacheGlobal;
const store: Map<string, Entry> = (g.__arenaTtlCache ??= new Map());

/** سقف تعداد کلیدها؛ کلیدهای پویا (مثلاً شناسهٔ حراج یا سؤال دستیار) نباید حافظه را بی‌انتها پر کنند. */
export const MAX_ENTRIES = 5000;
const SWEEP_EVERY_MS = 10_000;

/** همهٔ مدخل‌های منقضی را پاک می‌کند (O(n)، پس حداکثر هر SWEEP_EVERY_MS یک‌بار). */
function sweep(now: number): void {
  if (now - (g.__arenaTtlCacheSweep ?? 0) < SWEEP_EVERY_MS) return;
  g.__arenaTtlCacheSweep = now;
  for (const [key, entry] of store) if (entry.expires <= now) store.delete(key);
}

export function cached<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = store.get(key);
  if (hit) {
    if (hit.expires > now) return hit.value as Promise<T>;
    store.delete(key); // منقضی: پاک کن تا درج دوباره به انتهای ترتیب Map برود
  }

  sweep(now);
  // هنوز پر است (همه زنده‌اند)؟ قدیمی‌ترین درج‌ها را بیرون کن.
  while (store.size >= MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    store.delete(oldest);
  }

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

/** فقط برای تست‌ها */
export function cacheSize(): number {
  return store.size;
}
