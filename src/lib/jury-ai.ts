import { prisma } from "./db";
import { askJson } from "./ai";
import { parseImages } from "./product";

type JuryResult = { quality: number; notes: string };

const SCHEMA = {
  type: "object",
  properties: {
    quality: { type: "integer", minimum: 0, maximum: 100 },
    notes: { type: "string" },
  },
  required: ["quality", "notes"],
  additionalProperties: false,
};

const SYSTEM = [
  "تو یکی از داوران هوش‌مصنوعی «میدان بنیان‌گذاران تپسل» هستی.",
  "صفحهٔ محصول یک تیم را که در ۴۸ ساعت ساخته شده ارزیابی می‌کنی.",
  "معیارها: کامل بودن اطلاعات، وضوح توضیح و پیام محصول، باورپذیری برای یک محصول ۴۸ساعته.",
  "quality عددی صحیح بین ۰ تا ۱۰۰. notes حداکثر ۶۰ کلمه، فارسی و مشخص.",
].join(" ");

function describeProduct(p: {
  name: string;
  tagline: string;
  description: string;
  demoUrl: string;
  teaserUrl: string;
  images: string;
  specialName: string;
  specialDesc: string;
}) {
  const images = parseImages(p.images);
  return [
    `نام: ${p.name || "—"}`,
    `تگ‌لاین: ${p.tagline || "—"}`,
    `توضیح: ${p.description || "—"}`,
    `لینک دمو: ${p.demoUrl ? "دارد" : "ندارد"}`,
    `تیزر: ${p.teaserUrl ? "دارد" : "ندارد"}`,
    `تعداد تصویر: ${images.length}`,
    `نسخهٔ ویژه: ${p.specialName ? `${p.specialName} — ${p.specialDesc || "بدون توضیح"}` : "ندارد"}`,
  ].join("\n");
}

/** ارزیابی هوش مصنوعی محصول؛ در نبود کلید یا خطا هیچ کاری نمی‌کند (null-safe) */
export async function runJuryAi(productId: string): Promise<JuryResult | null> {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) return null;

  const result = await askJson<JuryResult>(SYSTEM, describeProduct(product), SCHEMA, 512);
  if (!result) return null;

  const quality = Math.max(0, Math.min(100, Math.round(result.quality)));
  const notes = (result.notes || "").slice(0, 400);

  await prisma.product.update({
    where: { id: productId },
    data: { aiQuality: quality, aiNotes: notes },
  });

  return { quality, notes };
}
