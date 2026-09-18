import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const unsubscribeSchema = z.object({
  endpoint: z.string().trim().min(1).max(2000).url(),
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

  const parsed = unsubscribeSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "اطلاعات نامعتبر است" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  await prisma.pushSubscription.deleteMany({ where: { endpoint: parsed.data.endpoint, userId: user.id } });

  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
