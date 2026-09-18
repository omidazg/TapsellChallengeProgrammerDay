"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getPhase, phaseIndex } from "@/lib/phase";
import { DEFAULTS } from "@/lib/constants";
import { serializeImages, readyToSubmit, MAX_IMAGES } from "@/lib/product";
import { runJuryAi } from "@/lib/jury-ai";
import { isNextImageHost } from "@/lib/idea";
import { isValidUploadName, UPLOAD_URL_PREFIX } from "@/lib/uploads";

export type ProductActionState = { error?: string; ok?: boolean };

/**
 * نشانی تصویر محصول باید یا یک فایل آپلودشدهٔ محلی (`/uploads/<hash>.webp`) یا
 * یک نشانی https روی یکی از میزبان‌های مجاز در next.config.ts باشد.
 */
function isAllowedImageUrl(v: string): boolean {
  if (v === "") return true;
  if (v.startsWith(UPLOAD_URL_PREFIX)) return isValidUploadName(v.slice(UPLOAD_URL_PREFIX.length));
  return isNextImageHost(v);
}

const productSchema = z.object({
  name: z.string().trim().min(1, "نام محصول را بنویس").max(80, "نام خیلی طولانی است"),
  tagline: z.string().trim().max(160, "تگ‌لاین خیلی طولانی است").optional().default(""),
  description: z.string().trim().max(4000).optional().default(""),
  demoUrl: z.string().trim().max(500).optional().default(""),
  teaserUrl: z.string().trim().max(500).optional().default(""),
  images: z
    .array(z.string().trim().max(500))
    .max(MAX_IMAGES)
    .optional()
    .default([])
    .refine((arr) => arr.every(isAllowedImageUrl), "یکی از نشانی‌های تصویر مجاز نیست"),
  price: z.coerce.number().int().min(DEFAULTS.minPrice, `قیمت حداقل ${DEFAULTS.minPrice} است`).max(DEFAULTS.maxPrice, `قیمت حداکثر ${DEFAULTS.maxPrice} است`),
  specialName: z.string().trim().max(80).optional().default(""),
  specialDesc: z.string().trim().max(400).optional().default(""),
  specialStart: z.coerce.number().int().min(5, "قیمت شروع حداقل ۵ است").max(100, "قیمت شروع حداکثر ۱۰۰ است"),
});

async function assertEditable() {
  const { phase } = await getPhase();
  if (phaseIndex(phase) >= phaseIndex("MARKET")) {
    return "مرکز ساخت از فاز «روز بازار» قفل شده است";
  }
  return null;
}

/** ذخیرهٔ پیش‌نویس یا ثبت نهایی محصول (upsert بر اساس teamId) */
export async function saveProductAction(prevState: ProductActionState, formData: FormData): Promise<ProductActionState> {
  const user = await requireUser();
  if (!user.teamId) return { error: "ابتدا باید عضو یک تیم باشی" };

  const editError = await assertEditable();
  if (editError) return { error: editError };

  const images = formData.getAll("images").map((v) => String(v)).filter((v) => v.trim().length > 0);

  const parsed = productSchema.safeParse({
    name: formData.get("name"),
    tagline: formData.get("tagline") ?? "",
    description: formData.get("description") ?? "",
    demoUrl: formData.get("demoUrl") ?? "",
    teaserUrl: formData.get("teaserUrl") ?? "",
    images,
    price: formData.get("price"),
    specialName: formData.get("specialName") ?? "",
    specialDesc: formData.get("specialDesc") ?? "",
    specialStart: formData.get("specialStart"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "ورودی نامعتبر است" };
  }

  const intent = String(formData.get("intent") ?? "draft");
  const data = parsed.data;
  const imagesJson = serializeImages(data.images);

  if (intent === "submit") {
    const readyCheck = readyToSubmit({
      name: data.name,
      tagline: data.tagline,
      description: data.description,
      demoUrl: data.demoUrl,
      teaserUrl: data.teaserUrl,
      images: imagesJson,
      price: data.price,
      specialName: data.specialName,
      submittedAt: null,
    });
    if (!readyCheck) {
      return { error: "پیش از ثبت نهایی، همهٔ موارد چک‌لیست را کامل کن" };
    }
  }

  const product = await prisma.product.upsert({
    where: { teamId: user.teamId },
    update: {
      name: data.name,
      tagline: data.tagline,
      description: data.description,
      demoUrl: data.demoUrl,
      teaserUrl: data.teaserUrl,
      images: imagesJson,
      price: data.price,
      specialName: data.specialName,
      specialDesc: data.specialDesc,
      specialStart: data.specialStart,
      ...(intent === "submit" ? { submittedAt: new Date() } : {}),
    },
    create: {
      teamId: user.teamId,
      name: data.name,
      tagline: data.tagline,
      description: data.description,
      demoUrl: data.demoUrl,
      teaserUrl: data.teaserUrl,
      images: imagesJson,
      price: data.price,
      specialName: data.specialName,
      specialDesc: data.specialDesc,
      specialStart: data.specialStart,
      ...(intent === "submit" ? { submittedAt: new Date() } : {}),
    },
  });

  if (intent === "submit") {
    await runJuryAi(product.id).catch(() => null);
  }

  revalidatePath("/build");
  return { ok: true };
}

/** بازکردن قفل محصول برای ویرایش دوباره (پاک‌کردن submittedAt) */
export async function unsubmitProductAction(): Promise<ProductActionState> {
  const user = await requireUser();
  if (!user.teamId) return { error: "ابتدا باید عضو یک تیم باشی" };

  const editError = await assertEditable();
  if (editError) return { error: editError };

  const product = await prisma.product.findUnique({ where: { teamId: user.teamId } });
  if (!product) return { error: "هنوز محصولی ثبت نکرده‌ای" };

  await prisma.product.update({ where: { id: product.id }, data: { submittedAt: null } });
  revalidatePath("/build");
  return { ok: true };
}
