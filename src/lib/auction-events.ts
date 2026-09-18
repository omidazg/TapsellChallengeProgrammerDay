/**
 * پخش‌کنندهٔ درون‌پردازه‌ای وضعیت حراج زنده برای Server-Sent Events.
 *
 * - فقط وقتی مشترک (اتصال SSE) وجود دارد یک تایمر (~۱ ثانیه) روشن است؛ با رفتن آخرین مشترک خاموش می‌شود.
 * - در هر تیک وضعیت عمومی حراج یک‌بار خوانده می‌شود (از کش کوتاه‌مدت) و فقط اگر
 *   نسخهٔ سریال‌شده عوض شده باشد برای همهٔ مشترک‌ها فرستاده می‌شود.
 * - `publishAuctionChange()` کش حراج را باطل می‌کند و بلافاصله یک تیک اجرا می‌کند
 *   (پس از ثبت پیشنهاد، تسویه یا شروع حراج).
 * - نمونهٔ پیش‌فرض روی globalThis نگه داشته می‌شود تا HMR آن را دوتا نکند.
 *
 * دادهٔ فرستاده‌شده فقط عمومی است (همان چیزی که /api/auction/[id]/state به همه می‌دهد)؛
 * «بالاترین هستم؟» را کلاینت از highest.userId حساب می‌کند و کیف پول از سرور-کامپوننت می‌آید.
 */
import { invalidate } from "./ttl-cache";

export type AuctionSnapshot = { id: string | null; state: unknown };
export type Subscriber = (payload: string) => void;

export type Broadcaster = {
  subscribe(fn: Subscriber): () => void;
  /** درخواست تیک فوری (مثلاً پس از تغییر داده). */
  poke(): void;
  subscriberCount(): number;
  isRunning(): boolean;
  /** برای تست: منتظر ماندن تا تیک در حال اجرا تمام شود. */
  idle(): Promise<void>;
};

export const AUCTION_CACHE_PREFIX = "auction:";

/** قالب یک پیام SSE با نام رویداد `state`. */
export function sseMessage(event: string, data: string): string {
  return `event: ${event}\ndata: ${data}\n\n`;
}

export function createBroadcaster(load: () => Promise<AuctionSnapshot>, intervalMs = 1000): Broadcaster {
  const subscribers = new Set<Subscriber>();
  let timer: ReturnType<typeof setInterval> | null = null;
  let lastSerialized: string | null = null;
  let running: Promise<void> | null = null;
  let dirty = false;

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
    lastSerialized = null;
  }

  async function runOnce() {
    let serialized: string;
    try {
      serialized = JSON.stringify(await load());
    } catch {
      return; // خطای موقت دیتابیس؛ تیک بعدی دوباره تلاش می‌کند
    }
    if (subscribers.size === 0 || serialized === lastSerialized) return;
    lastSerialized = serialized;
    const msg = sseMessage("state", serialized);
    for (const fn of [...subscribers]) {
      try {
        fn(msg);
      } catch {
        subscribers.delete(fn);
      }
    }
  }

  function tick() {
    if (running) {
      // یک تیک در جریان است؛ بعد از آن یک‌بار دیگر اجرا شود تا تغییر تازه از دست نرود.
      dirty = true;
      return;
    }
    running = (async () => {
      do {
        dirty = false;
        await runOnce();
      } while (dirty && subscribers.size > 0);
    })().finally(() => {
      running = null;
    });
  }

  return {
    subscribe(fn) {
      subscribers.add(fn);
      if (lastSerialized !== null) {
        // مشترک تازه بلافاصله آخرین وضعیت را می‌گیرد.
        try {
          fn(sseMessage("state", lastSerialized));
        } catch {
          subscribers.delete(fn);
        }
      }
      if (!timer) {
        timer = setInterval(tick, intervalMs);
        timer.unref?.();
      }
      if (lastSerialized === null) tick();
      return () => {
        subscribers.delete(fn);
        if (subscribers.size === 0) stop();
      };
    },
    poke() {
      if (subscribers.size > 0) tick();
    },
    subscriberCount: () => subscribers.size,
    isRunning: () => timer !== null,
    idle: async () => {
      while (running) await running;
    },
  };
}

async function loadLiveSnapshot(): Promise<AuctionSnapshot> {
  // import پویا تا وابستگی حلقوی ایستا با auction.ts ساخته نشود.
  const { getLiveAuctionIdCached, getPublicAuctionState } = await import("./auction");
  const id = await getLiveAuctionIdCached();
  return { id, state: id ? await getPublicAuctionState(id) : null };
}

type BroadcastGlobal = typeof globalThis & { __arenaAuctionBroadcaster?: Broadcaster };
const g = globalThis as BroadcastGlobal;

export function auctionBroadcaster(): Broadcaster {
  return (g.__arenaAuctionBroadcaster ??= createBroadcaster(loadLiveSnapshot));
}

/** پس از هر نوشتن در حراج صدا زده شود: کش باطل و وضعیت تازه فوراً پخش می‌شود. */
export function publishAuctionChange(): void {
  invalidate(AUCTION_CACHE_PREFIX);
  g.__arenaAuctionBroadcaster?.poke();
}
