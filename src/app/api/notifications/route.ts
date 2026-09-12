import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getPhase } from "@/lib/phase";
import { listNotifications, unreadCount } from "@/lib/notifications";

// این مسیر برای polling است؛ هیچ‌وقت نباید کش شود.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "وارد نشده‌ای" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  const [unread, items, { phase }] = await Promise.all([
    unreadCount(user.id),
    listNotifications(user.id, 20),
    getPhase(),
  ]);
  return NextResponse.json({ unread, items, phase }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}
