import { NextResponse } from "next/server";
import { getFeedCached } from "@/lib/feed";

// فید عمومی است (بدون ورود قابل مشاهده)؛ هیچ‌وقت نباید در مرورگر/پروکسی کش شود.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const events = await getFeedCached();
  return NextResponse.json({ events }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}
