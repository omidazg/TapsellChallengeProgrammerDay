import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

// برای بنر «نظرسنجی پایان بازی» در AppShell: آیا کاربر جاری قبلاً پاسخ داده؟
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "وارد نشده‌ای" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  const existing = await prisma.surveyResponse.findUnique({ where: { userId: user.id }, select: { id: true } });
  return NextResponse.json({ answered: !!existing }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}
