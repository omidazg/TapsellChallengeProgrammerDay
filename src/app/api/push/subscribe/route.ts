import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isAllowedPushEndpoint, MAX_PUSH_SUBSCRIPTIONS_PER_USER } from "@/lib/push";

export const dynamic = "force-dynamic";

const subscriptionSchema = z.object({
  endpoint: z.string().trim().min(1).max(2000).url(),
  keys: z.object({
    p256dh: z.string().trim().min(1).max(500),
    auth: z.string().trim().min(1).max(500),
  }),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "وارد نشده‌ای" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "بدنهٔ درخواست نامعتبر است" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const parsed = subscriptionSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "اطلاعات اشتراک اعلان نامعتبر است" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const { endpoint, keys } = parsed.data;
  // فقط سرویس‌های Push شناخته‌شده؛ وگرنه سرور به هر URL دلخواهی (حتی شبکهٔ داخلی) POST می‌زد.
  if (!isAllowedPushEndpoint(endpoint)) {
    return NextResponse.json({ error: "سرویس اعلان این مرورگر پشتیبانی نمی‌شود" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: { userId: user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth },
    // اگر همین endpoint قبلاً به کاربر دیگری تعلق داشت (مثلاً روی مرورگر مشترک)، به کاربر جاری منتقل می‌شود.
    update: { userId: user.id, p256dh: keys.p256dh, auth: keys.auth },
  });

  // سقف اشتراک برای هر کاربر: هر اعلان به همهٔ اشتراک‌ها فرستاده می‌شود؛ قدیمی‌ترها حذف می‌شوند.
  const stale = await prisma.pushSubscription.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    skip: MAX_PUSH_SUBSCRIPTIONS_PER_USER,
    select: { id: true },
  });
  if (stale.length > 0) {
    await prisma.pushSubscription.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } });
  }

  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
