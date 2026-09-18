import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { saveImage, UploadError } from "@/lib/uploads";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const UPLOAD_RATE = { limit: 20, windowMs: 10 * 60 * 1000 };

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "وارد نشده‌ای" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  if (!rateLimit("upload", user.id, UPLOAD_RATE).ok) {
    return NextResponse.json(
      { error: "تعداد آپلودهای اخیر زیاد است؛ کمی صبر کن و دوباره تلاش کن" },
      { status: 429, headers: { "Cache-Control": "no-store" } }
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "درخواست نامعتبر است" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "فایلی ارسال نشده است" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const { url, thumb } = await saveImage(file, user.id);
    return NextResponse.json({ url, thumb }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const message = e instanceof UploadError ? e.message : "آپلود با خطا مواجه شد";
    return NextResponse.json({ error: message }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}
