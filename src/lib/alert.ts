/**
 * ارسال هشدار برای رخدادهای مهم (خطای اسکجولر، onRequestError و ...) به یک وب‌هوک عمومی
 * و/یا تلگرام. هرگز throw نمی‌کند (این ماژول نباید مسیر اصلی برنامه را خراب کند) و وقتی
 * هیچ‌کدام تنظیم نشده باشد کاملاً no-op است.
 *
 * throttle: هر کلید حداکثر یک‌بار در ۵ دقیقه، در حافظهٔ پردازش (روی globalThis تا با
 * HMR/بارگذاری چندبارهٔ ماژول در dev هم پایدار بماند).
 */

type Fields = Record<string, unknown>;
type FetchFn = typeof fetch;

const THROTTLE_MS = 5 * 60_000;
const TIMEOUT_MS = 5_000;

type AlertGlobal = typeof globalThis & { __arenaAlertLastSent?: Map<string, number> };

function throttleMap(): Map<string, number> {
  const g = globalThis as AlertGlobal;
  if (!g.__arenaAlertLastSent) g.__arenaAlertLastSent = new Map();
  return g.__arenaAlertLastSent;
}

// قابل تزریق برای تست (اسموک‌تست fetch جعلی می‌گذارد تا هیچ درخواست واقعی‌ای نرود).
let fetchImpl: FetchFn = (...args: Parameters<FetchFn>) => fetch(...args);

export function setAlertFetch(fn: FetchFn) {
  fetchImpl = fn;
}

export function resetAlertFetch() {
  fetchImpl = (...args: Parameters<FetchFn>) => fetch(...args);
}

async function withTimeout(fn: (signal: AbortSignal) => Promise<unknown>) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    await fn(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

async function sendWebhook(url: string, key: string, message: string, fields?: Fields) {
  await withTimeout((signal) =>
    fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key, message, fields, ts: new Date().toISOString() }),
      signal,
    })
  );
}

async function sendTelegram(apiBase: string, botToken: string, chatId: string, key: string, message: string, fields?: Fields) {
  const text = fields && Object.keys(fields).length > 0 ? `${key}: ${message}\n${JSON.stringify(fields)}` : `${key}: ${message}`;
  await withTimeout((signal) =>
    fetchImpl(`${apiBase}/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
      signal,
    })
  );
}

/** ارسال هشدار؛ throttle شده روی `key`. هرگز throw نمی‌کند. */
export async function alert(key: string, message: string, fields?: Fields): Promise<void> {
  try {
    const throttled = throttleMap();
    const now = Date.now();
    const last = throttled.get(key) ?? 0;
    if (now - last < THROTTLE_MS) return;
    throttled.set(key, now);

    const webhookUrl = process.env.ALERT_WEBHOOK_URL;
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    const apiBase = process.env.TELEGRAM_API_BASE || "https://api.telegram.org";

    const tasks: Promise<void>[] = [];
    if (webhookUrl) tasks.push(sendWebhook(webhookUrl, key, message, fields).catch(() => {}));
    if (botToken && chatId) tasks.push(sendTelegram(apiBase, botToken, chatId, key, message, fields).catch(() => {}));

    if (tasks.length === 0) return;
    await Promise.allSettled(tasks);
  } catch {
    // هشدار هرگز نباید جریان اصلی را مختل کند
  }
}
