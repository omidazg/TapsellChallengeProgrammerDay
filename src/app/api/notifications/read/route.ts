import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { markAllRead } from "@/lib/notifications";

export const dynamic = "force-dynamic";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "وارد نشده‌ای" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  await markAllRead(user.id);
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
