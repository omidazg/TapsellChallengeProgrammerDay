"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { invalidate } from "@/lib/ttl-cache";

export type PrizeActionState = { error?: string; ok?: boolean };

/** بیشترین مقدار ستون Int در Prisma */
const MAX_INT = 2_147_483_647;

const schema = z.object({
  id: z.string().default(""),
  label: z.string().trim().min(1, "عنوان جایزه را بنویس").max(120, "عنوان خیلی طولانی است"),
  emoji: z.string().trim().max(16, "ایموجی خیلی طولانی است"),
  amountToman: z.preprocess(
    (v) => (String(v ?? "").trim() === "" ? null : v),
    z.coerce
      .number({ error: "مبلغ باید عدد باشد" })
      .int("مبلغ باید عدد صحیح باشد")
      .min(0, "مبلغ نمی‌تواند منفی باشد")
      .max(MAX_INT, "مبلغ بیشتر از سقف مجاز است")
      .nullable()
  ),
  trackId: z.string().min(1, "محور را انتخاب کن"),
  category: z.enum(["", "TECH", "NON_TECH"], { error: "دسته نامعتبر است" }),
  kind: z.enum(["RANK", "SPECIAL"], { error: "نوع جایزه نامعتبر است" }),
  rank: z.coerce.number({ error: "رتبه باید عدد باشد" }).int("رتبه باید عدد صحیح باشد").min(1, "رتبه از ۱ شروع می‌شود").max(100, "رتبه خیلی بزرگ است"),
  order: z.coerce.number({ error: "ترتیب باید عدد باشد" }).int("ترتیب باید عدد صحیح باشد").min(0, "ترتیب نمی‌تواند منفی باشد").max(100000, "ترتیب خیلی بزرگ است"),
  winnerProductId: z.string().default(""),
});

/** جوایز از اول به همه نشان داده می‌شوند و روی نتایج اثر دارند */
function revalidatePrizePages() {
  invalidate("scores:");
  revalidatePath("/", "layout");
}

/** افزودن یا ویرایش جایزه (شناسهٔ خالی یعنی جایزهٔ تازه) */
export async function savePrizeAction(prevState: PrizeActionState, formData: FormData): Promise<PrizeActionState> {
  const admin = await requireAdmin();
  const parsed = schema.safeParse({
    id: formData.get("id") ?? "",
    label: formData.get("label") ?? "",
    emoji: formData.get("emoji") ?? "",
    amountToman: formData.get("amountToman"),
    trackId: formData.get("trackId") ?? "",
    category: formData.get("category") ?? "",
    kind: formData.get("kind"),
    rank: String(formData.get("rank") ?? "").trim() || "1",
    order: String(formData.get("order") ?? "").trim() || "0",
    winnerProductId: formData.get("winnerProductId") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "ورودی نامعتبر است" };
  const d = parsed.data;

  const track = await prisma.track.findUnique({ where: { id: d.trackId }, select: { category: true } });
  if (!track) return { error: "محور پیدا نشد" };
  // دسته فقط در محور ترکیبی معنا دارد؛ در بقیه همهٔ ثبت‌ها یک دسته دارند.
  const category = track.category === "MIXED" ? d.category : "";

  let winnerProductId: string | null = null;
  if (d.kind === "SPECIAL" && d.winnerProductId) {
    const product = await prisma.product.findUnique({
      where: { id: d.winnerProductId },
      select: { trackId: true, submittedAt: true },
    });
    if (!product?.submittedAt) return { error: "محصول برنده باید ثبت نهایی شده باشد" };
    if (product.trackId !== d.trackId) return { error: "محصول برنده باید از همین محور باشد" };
    winnerProductId = d.winnerProductId;
  }

  const data = {
    label: d.label,
    emoji: d.emoji || "🏆",
    amountToman: d.amountToman,
    trackId: d.trackId,
    category,
    kind: d.kind,
    rank: d.kind === "RANK" ? d.rank : 1,
    order: d.order,
    winnerProductId,
  };

  if (d.id) {
    const before = await prisma.prize.findUnique({ where: { id: d.id } });
    if (!before) return { error: "جایزه پیدا نشد" };
    await prisma.prize.update({ where: { id: d.id }, data });
    await audit(admin.id, "prize.update", d.id, { before, after: data });
  } else {
    const created = await prisma.prize.create({ data });
    await audit(admin.id, "prize.create", created.id, { after: data });
  }
  revalidatePrizePages();
  return { ok: true };
}

export async function deletePrizeAction(prevState: PrizeActionState, formData: FormData): Promise<PrizeActionState> {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const before = await prisma.prize.findUnique({ where: { id } });
  if (!before) return { error: "جایزه پیدا نشد" };
  await prisma.prize.delete({ where: { id } });
  await audit(admin.id, "prize.delete", id, { before });
  revalidatePrizePages();
  return { ok: true };
}
