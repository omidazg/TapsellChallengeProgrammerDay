import { getCurrentUser } from "@/lib/auth";
import { auctionBroadcaster } from "@/lib/auction-events";

// اتصال طولانی SSE؛ هرگز کش یا پیش‌رندر نشود.
export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 15_000;

/**
 * جریان Server-Sent Events وضعیت عمومی حراج زنده.
 * رویداد `state` با داده‌ی `{ id, state }` فقط وقتی وضعیت عوض شود فرستاده می‌شود.
 * هر ۱۵ ثانیه یک کامنت heartbeat می‌رود تا پروکسی‌ها اتصال را نبندند.
 */
export async function GET(request: Request) {
  // getCurrentUser (و نه فقط شناسهٔ توکن) تا نشست‌های باطل‌شده و کاربران مسدود رد شوند
  const user = await getCurrentUser().catch(() => null);
  if (!user) {
    return new Response("وارد نشده‌ای", { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  const encoder = new TextEncoder();
  let cleanup: (() => void) | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (text: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          cleanup?.();
        }
      };

      // فاصلهٔ اتصال دوباره در EventSource + یک کامنت اولیه تا سرآیندها فوراً flush شوند.
      send("retry: 3000\n: connected\n\n");

      const unsubscribe = auctionBroadcaster().subscribe(send);
      const heartbeat = setInterval(() => send(": ping\n\n"), HEARTBEAT_MS);

      cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        request.signal.removeEventListener("abort", onAbort);
        try {
          controller.close();
        } catch {
          /* جریان از قبل بسته شده */
        }
      };
      const onAbort = () => cleanup?.();
      if (request.signal.aborted) cleanup();
      else request.signal.addEventListener("abort", onAbort);
    },
    cancel() {
      cleanup?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      // no-transform: فشرده‌سازی داخلی Next و encode در Caddy جریان را بافر نکنند.
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
