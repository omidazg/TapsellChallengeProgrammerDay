"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { adminSetLiveStatus } from "@/lib/studio";

export type StudioActionState = { error?: string; ok?: boolean };

const schema = z.object({
  productId: z.string().min(1),
  status: z.enum(["REQUESTED", "PUBLISHING", "LIVE", "REJECTED"], { error: "وضعیت نامعتبر است" }),
  liveUrl: z.string().trim().max(400, "لینک خیلی بلند است").default(""),
  note: z.string().trim().max(600, "یادداشت خیلی بلند است").default(""),
});

/** تغییر وضعیت انتشار یک محصول روی بازار استودیو (لایو به لینک http نیاز دارد) */
export async function setLiveStatusAction(prevState: StudioActionState, formData: FormData): Promise<StudioActionState> {
  const admin = await requireAdmin();
  const parsed = schema.safeParse({
    productId: formData.get("productId"),
    status: formData.get("status"),
    liveUrl: formData.get("liveUrl") ?? "",
    note: formData.get("note") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "ورودی نامعتبر است" };
  const { productId, status, liveUrl, note } = parsed.data;
  if (status === "REJECTED" && !note) return { error: "بنویس چه چیزی باید اصلاح شود؛ برای تیم ارسال می‌شود" };

  const before = await prisma.product.findUnique({
    where: { id: productId },
    select: { liveStatus: true, liveUrl: true, liveAdminNote: true },
  });
  if (!before) return { error: "محصول پیدا نشد" };

  const res = await adminSetLiveStatus(productId, { status, liveUrl, note });
  if (res.error) return { error: res.error };
  await audit(admin.id, "studio.set_status", productId, {
    before: { status: before.liveStatus, liveUrl: before.liveUrl, note: before.liveAdminNote },
    after: { status, liveUrl: status === "LIVE" ? liveUrl : before.liveUrl, note },
  });
  revalidatePath("/admin/studio");
  revalidatePath("/admin/jury");
  revalidatePath("/build");
  revalidatePath("/market");
  return { ok: true };
}
