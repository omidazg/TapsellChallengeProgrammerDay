import { NextResponse } from "next/server";
import { getHallPayloadCached } from "@/lib/hall";

// نمای سالن بدون ورود در دسترس است؛ هیچ‌وقت نباید در مرورگر/پروکسی کش شود.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const data = await getHallPayloadCached();
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store, max-age=0" } });
}
