"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { setSetting } from "@/lib/admin";
import { adminMarkOrderPaid, adminRejectOrder, MANUAL_INSTRUCTIONS_KEY } from "@/lib/coins";

export type CoinsActionState = { error?: string; ok?: boolean };

const orderSchema = z.object({
  orderId: z.string().min(1),
  note: z.string().trim().max(300, "یادداشت خیلی طولانی است").default(""),
});

function parseOrder(formData: FormData) {
  return orderSchema.safeParse({ orderId: formData.get("orderId"), note: formData.get("note") ?? "" });
}

function revalidateCoinPages() {
  revalidatePath("/admin/coins");
  revalidatePath("/admin");
  revalidatePath("/wallet");
  revalidatePath("/coins");
}

/** تأیید دستی پرداخت: سکه‌ها (یک‌بار) به کیف کاربر اضافه و مبلغ به صندوق جایزه افزوده می‌شود */
export async function markOrderPaidAction(prevState: CoinsActionState, formData: FormData): Promise<CoinsActionState> {
  const admin = await requireAdmin();
  const parsed = parseOrder(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "ورودی نامعتبر است" };
  const { orderId, note } = parsed.data;

  const before = await prisma.coinOrder.findUnique({ where: { id: orderId }, select: { status: true, userId: true, coins: true, amountRial: true } });
  if (!before) return { error: "سفارش پیدا نشد" };
  const res = await adminMarkOrderPaid(orderId, note);
  if (!res.ok) return { error: res.error ?? "تأیید سفارش ممکن نشد" };
  await audit(admin.id, "coins.mark_paid", orderId, {
    userId: before.userId,
    coins: before.coins,
    amountRial: before.amountRial,
    fromStatus: before.status,
    note,
  });
  revalidateCoinPages();
  return { ok: true };
}

/** رد سفارش در انتظار (مثلاً وجهی نرسیده است) */
export async function rejectOrderAction(prevState: CoinsActionState, formData: FormData): Promise<CoinsActionState> {
  const admin = await requireAdmin();
  const parsed = parseOrder(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "ورودی نامعتبر است" };
  const { orderId, note } = parsed.data;

  const order = await prisma.coinOrder.findUnique({ where: { id: orderId }, select: { userId: true, coins: true } });
  if (!order) return { error: "سفارش پیدا نشد" };
  const res = await adminRejectOrder(orderId, note);
  if (!res.ok) return { error: "فقط سفارش در انتظار پرداخت را می‌توان رد کرد" };
  await audit(admin.id, "coins.reject", orderId, { userId: order.userId, coins: order.coins, note });
  revalidateCoinPages();
  return { ok: true };
}

const instructionsSchema = z.object({
  text: z.string().trim().max(1500, "متن راهنما حداکثر ۱۵۰۰ نویسه است"),
});

/** متن راهنمای پرداخت دستی (شمارهٔ کارت، نحوهٔ ارسال رسید…)؛ خالی = بازگشت به متن پیش‌فرض */
export async function saveManualInstructionsAction(prevState: CoinsActionState, formData: FormData): Promise<CoinsActionState> {
  const admin = await requireAdmin();
  const parsed = instructionsSchema.safeParse({ text: formData.get("text") ?? "" });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "ورودی نامعتبر است" };
  const { text } = parsed.data;

  const before = await prisma.setting.findUnique({ where: { key: MANUAL_INSTRUCTIONS_KEY } });
  if (text) await setSetting(MANUAL_INSTRUCTIONS_KEY, text);
  else await prisma.setting.deleteMany({ where: { key: MANUAL_INSTRUCTIONS_KEY } });
  await audit(admin.id, "coins.manual_instructions", "", { before: before?.value ?? null, after: text || null });
  revalidateCoinPages();
  return { ok: true };
}
