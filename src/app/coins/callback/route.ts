import { verifyCoinOrder } from "@/lib/coins";

/**
 * بازگشت از درگاه پرداخت: سفارش با (gateway, authority) تأیید و سکه‌ها یک‌بار به کیف اضافه می‌شوند.
 * تأیید در lib/coins idempotent است، پس بازخوانی یا دوباره‌زدن همین آدرس سکهٔ اضافه نمی‌دهد.
 * برخی درگاه‌ها نتیجه را با POST برمی‌گردانند؛ هر دو حالت پشتیبانی می‌شود.
 */
export const dynamic = "force-dynamic";

async function handle(params: Record<string, string>): Promise<Response> {
  const gateway = params.gateway ?? "";
  // زرین‌پال و مشابه‌ها نام پارامتر را با حرف بزرگ می‌فرستند
  const authority = params.authority ?? params.Authority ?? "";

  let target: string;
  try {
    const result = await verifyCoinOrder(gateway, authority, params);
    target = result.ok
      ? `/coins?paid=${result.coins}`
      : `/coins?failed=1${result.orderId ? `&order=${encodeURIComponent(result.orderId)}` : ""}`;
  } catch (e) {
    console.error("coin order verify failed", e);
    target = "/coins?failed=1";
  }
  // آدرس نسبی تا پشت پروکسی هم به همان دامنه‌ای برگردد که کاربر از آن آمده
  return new Response(null, { status: 303, headers: { Location: target, "Cache-Control": "no-store" } });
}

export async function GET(request: Request): Promise<Response> {
  const params = Object.fromEntries(new URL(request.url).searchParams.entries());
  return handle(params);
}

export async function POST(request: Request): Promise<Response> {
  const params: Record<string, string> = Object.fromEntries(new URL(request.url).searchParams.entries());
  try {
    const form = await request.formData();
    for (const [k, v] of form.entries()) if (typeof v === "string") params[k] = v;
  } catch {
    // بدنهٔ فرم نداشت؛ همان پارامترهای آدرس کافی است
  }
  return handle(params);
}
