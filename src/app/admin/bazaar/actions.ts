"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireStudioOp } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { importBazaarRows, saveBazaarStat, setBazaarFlag, snapshotBazaarStats } from "@/lib/bazaar";
import { MAX_STAT_VALUE, parseBazaarWorkbook } from "./import";

export type BazaarActionState = { error?: string; ok?: boolean; saved?: number; skipped?: string[] };

const MAX_FILE_BYTES = 5 * 1024 * 1024;

/** آمار بازار روی جدول امتیاز و صفحهٔ داوری اثر دارد */
function revalidateBazaarPages() {
  revalidatePath("/admin/bazaar");
  revalidatePath("/admin/jury");
  revalidatePath("/admin/settlement");
  revalidatePath("/leaderboard");
}

/** ویرایش دستی آمار یک محصول */
export async function saveBazaarStatAction(prevState: BazaarActionState, formData: FormData): Promise<BazaarActionState> {
  const user = await requireStudioOp();
  const productId = String(formData.get("productId") ?? "");
  const input = {
    activeInstalls: String(formData.get("activeInstalls") ?? "").trim() || "0",
    revenueToman: String(formData.get("revenueToman") ?? "").trim() || "0",
    commentCount: String(formData.get("commentCount") ?? "").trim() || "0",
    rating: String(formData.get("rating") ?? "").trim(),
  };
  if ([input.activeInstalls, input.revenueToman, input.commentCount].some((v) => Number(v) > MAX_STAT_VALUE)) {
    return { error: "عدد بیشتر از سقف مجاز است" };
  }
  const before = await prisma.bazaarStat.findUnique({
    where: { productId },
    select: { activeInstalls: true, revenueToman: true, rating: true, commentCount: true, source: true },
  });
  const res = await saveBazaarStat(productId, input, "manual");
  if (res.error) return { error: res.error };
  await audit(user.id, "bazaar.save_stat", productId, { before, after: input });
  revalidateBazaarPages();
  return { ok: true };
}

/** ورود گروهی آمار از فایل اکسل */
export async function importBazaarAction(prevState: BazaarActionState, formData: FormData): Promise<BazaarActionState> {
  const user = await requireStudioOp();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "فایل اکسل را انتخاب کن" };
  if (file.size > MAX_FILE_BYTES) return { error: "حجم فایل حداکثر ۵ مگابایت است" };

  const parsed = await parseBazaarWorkbook(await file.arrayBuffer());
  if ("error" in parsed) return { error: parsed.error };
  const { saved, skipped } = await importBazaarRows(parsed.rows);
  const allSkipped = [...parsed.rejected, ...skipped];
  await audit(user.id, "bazaar.import", file.name.slice(0, 120), { saved, skipped: allSkipped });
  revalidateBazaarPages();
  return { ok: true, saved, skipped: allSkipped };
}

/** پرچم یا رفع پرچم محصول مشکوک به نصب یا نظر جعلی؛ آمار پرچم‌خورده در امتیاز حساب نمی‌شود. */
export async function setBazaarFlagAction(prevState: BazaarActionState, formData: FormData): Promise<BazaarActionState> {
  const user = await requireStudioOp();
  const productId = String(formData.get("productId") ?? "");
  const flagged = formData.get("flagged") === "1";
  const note = String(formData.get("note") ?? "").trim();
  if (flagged && !note) return { error: "دلیل پرچم را بنویس؛ به داوران نشان داده می‌شود" };

  const product = await prisma.product.findUnique({ where: { id: productId }, select: { id: true } });
  if (!product) return { error: "محصول پیدا نشد" };
  await setBazaarFlag(productId, flagged, note);
  await audit(user.id, flagged ? "bazaar.flag" : "bazaar.unflag", productId, { note });
  revalidateBazaarPages();
  return { ok: true };
}

/** برداشت نهایی آمار: زمان برداشت روی آمارهایی که هنوز برداشت نشده‌اند ثبت می‌شود. */
export async function snapshotBazaarAction(): Promise<BazaarActionState> {
  const user = await requireStudioOp();
  await snapshotBazaarStats();
  await audit(user.id, "bazaar.snapshot", "", {});
  revalidatePath("/admin/bazaar");
  return { ok: true };
}
