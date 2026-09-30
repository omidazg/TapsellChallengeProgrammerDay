/**
 * اعلان‌های فوری (Web Push). فراخوانی‌کننده هرگز نباید از این ماژول خطا بگیرد؛
 * هر خطایی داخل خودش لاگ و بلعیده می‌شود (نبود تنظیمات VAPID یا خطای شبکه
 * نباید مسیر اصلی برنامه — مثلاً notifyUser — را متوقف کند).
 */
import webpush from "web-push";
import { prisma } from "./db";

export type PushPayload = { title: string; body?: string; href?: string; tag: string };

/** برای تست: امکان جایگزینی فرستنده به‌جای webpush.sendNotification واقعی. */
export type PushSender = (
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: string,
  options: { TTL: number; urgency: "very-low" | "low" | "normal" | "high" }
) => Promise<{ statusCode: number }>;

// عمداً نتیجه را permanent کش نمی‌کنیم (بلکه فقط تشخیص می‌دهیم آخرین بار همین
// کلیدها تنظیم شده‌اند یا نه)؛ چک env هر بار ارزان است و این کار تست را ساده
// می‌کند و اگر env در runtime تغییر کند (مثلاً در تست) رفتار درست را می‌دهد.
let lastAppliedKey: string | null = null;

function configure(): boolean {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) {
    lastAppliedKey = null;
    return false;
  }
  const cacheKey = `${publicKey}:${privateKey}:${subject}`;
  if (cacheKey === lastAppliedKey) return true;
  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    lastAppliedKey = cacheKey;
    return true;
  } catch (e) {
    console.error("push: خطا در تنظیم VAPID", e);
    lastAppliedKey = null;
    return false;
  }
}

/** آیا کلیدهای VAPID تنظیم شده‌اند؟ برای مسیر GET /api/push/key و UI. */
export function isPushConfigured(): boolean {
  return configure();
}

export function getVapidPublicKey(): string | null {
  if (!configure()) return null;
  return process.env.VAPID_PUBLIC_KEY ?? null;
}

const defaultSender: PushSender = (subscription, payload, options) =>
  webpush.sendNotification(subscription, payload, options);

let sender: PushSender = defaultSender;

/** فقط برای تست‌ها: جایگزینی فرستنده. */
export function __setPushSenderForTest(fn: PushSender | null): void {
  sender = fn ?? defaultSender;
}

/**
 * سرور به endpoint هر اشتراک درخواست POST می‌زند؛ اگر هر URL دلخواهی پذیرفته شود،
 * کاربر می‌تواند سرور را وادار به درخواست به شبکهٔ داخلی (SSRF) کند. پس فقط
 * سرویس‌های Push شناخته‌شدهٔ مرورگرها (روی https) پذیرفته می‌شوند.
 * Chrome/Opera/Samsung: FCM — Firefox: Mozilla autopush — Safari: Apple — Edge: WNS.
 */
const PUSH_HOST_SUFFIXES = [
  "fcm.googleapis.com",
  "android.googleapis.com",
  "push.services.mozilla.com",
  "push.apple.com",
  "notify.windows.com",
];

export const MAX_PUSH_SUBSCRIPTIONS_PER_USER = 10;

export function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) return false;
  const host = url.hostname.toLowerCase();
  return PUSH_HOST_SUFFIXES.some((s) => host === s || host.endsWith(`.${s}`));
}

const CONCURRENCY = 20;

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx]);
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

/**
 * ارسال اعلان فوری به مجموعه‌ای از کاربران. هرگز throw نمی‌کند.
 * اشتراک‌هایی که سرویس‌دهنده 404/410 برگرداند (منقضی/لغوشده) حذف می‌شوند.
 */
export async function sendPushToUsers(userIds: string[], payload: PushPayload): Promise<void> {
  try {
    if (userIds.length === 0) return;
    if (!configure()) return;

    const subs = (
      await prisma.pushSubscription.findMany({
        where: { userId: { in: userIds } },
      })
      // ردیف‌های قدیمی پیش از اعتبارسنجی endpoint؛ فرستندهٔ جعلی تست‌ها شبکه نمی‌زند و فیلتر نمی‌شود.
    ).filter((s) => sender !== defaultSender || isAllowedPushEndpoint(s.endpoint));
    if (subs.length === 0) return;

    const body = JSON.stringify({
      title: payload.title,
      body: payload.body ?? "",
      href: payload.href ?? "/",
      tag: payload.tag,
    });
    const urgency = payload.tag === "OUTBID" ? "high" : "normal";
    const TTL = 60 * 60; // ۱ ساعت

    let sent = 0;
    let failed = 0;
    let removed = 0;

    await mapWithConcurrency(subs, CONCURRENCY, async (sub) => {
      try {
        await sender({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, body, { TTL, urgency });
        sent++;
      } catch (e) {
        const statusCode = (e as { statusCode?: number })?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          removed++;
          try {
            await prisma.pushSubscription.delete({ where: { id: sub.id } });
          } catch {
            /* ممکن است قبلاً حذف شده باشد */
          }
        } else {
          failed++;
        }
      }
    });

    console.log(`push: ارسال به ${subs.length} اشتراک — موفق ${sent}، ناموفق ${failed}، حذف‌شده ${removed} (tag=${payload.tag})`);
  } catch (e) {
    console.error("push: خطای غیرمنتظره در sendPushToUsers", e);
  }
}
