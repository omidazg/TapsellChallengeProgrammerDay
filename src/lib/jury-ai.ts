import { createHash } from "crypto";
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

type JuryCacheEntry = { hash: string; result: JuryResult; at: string };

function juryCacheKey(productId: string) {
  return `ai:jury:${productId}`;
}

function productContentHash(p: {
  name: string;
  tagline: string;
  description: string;
  demoUrl: string;
  teaserUrl: string;
  images: string;
  specialName: string;
  specialDesc: string;
}): string {
  const content = [p.name, p.tagline, p.description, p.demoUrl, p.teaserUrl, p.images, p.specialName, p.specialDesc].join("␟");
  return createHash("sha256").update(content).digest("hex");
}

/** ارزیابی هوش مصنوعی محصول؛ در نبود کلید یا خطا هیچ کاری نمی‌کند (null-safe). بر اساس هش محتوا کش می‌شود. */
export async function runJuryAi(productId: string): Promise<JuryResult | null> {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) return null;

  const hash = productContentHash(product);
  const cacheKey = juryCacheKey(productId);
  const cachedRow = await prisma.setting.findUnique({ where: { key: cacheKey } });
  if (cachedRow) {
    try {
      const cached = JSON.parse(cachedRow.value) as JuryCacheEntry;
      if (cached.hash === hash) return cached.result;
    } catch {
      // کش خراب؛ دوباره تولید می‌شود
    }
  }

  const result = await askJson<JuryResult>(SYSTEM, describeProduct(product), SCHEMA, 512);
  if (!result) return null;

  const quality = Math.max(0, Math.min(100, Math.round(result.quality)));
  const notes = (result.notes || "").slice(0, 400);
  const finalResult: JuryResult = { quality, notes };

  await prisma.product.update({
    where: { id: productId },
    data: { aiQuality: quality, aiNotes: notes },
  });

  const entry: JuryCacheEntry = { hash, result: finalResult, at: new Date().toISOString() };
  await prisma.setting.upsert({
    where: { key: cacheKey },
    create: { key: cacheKey, value: JSON.stringify(entry) },
    update: { value: JSON.stringify(entry) },
  });

  return finalResult;
}
