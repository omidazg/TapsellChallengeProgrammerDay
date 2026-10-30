"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { teamManageError } from "@/lib/team-access";
import { requestGoLive, cancelGoLive } from "@/lib/studio";
import { getPhase } from "@/lib/phase";
import { moduleGate, trackGate } from "@/lib/module-state";
import { DEFAULTS } from "@/lib/constants";
import { serializeImages, missingForSubmit, MAX_IMAGES, effectiveMaxPrice, imageUrlError, productSlug } from "@/lib/product";
import { requestAiRecheck, runJuryAi } from "@/lib/jury-ai";
import { getTrack } from "@/lib/track-data";
import { fa } from "@/lib/persian";
import { AI_SUBMIT_COOLDOWN_MS, aiEvalCapMessage, aiSubmitCooldownMessage, runCappedAiEval } from "@/lib/ai";
import { rateLimit } from "@/lib/rate-limit";

/**
 * `values`: مقادیر ارسالی فرم در صورت خطا، تا ری‌ست خودکار فرم (React 19) نوشته‌های کاربر را پاک نکند.
 * `missing`: موارد ناقص چک‌لیست وقتی «ثبت نهایی» رد شده (برای پیوند به فیلدها در فرم).
 * `notice`: پیام اطلاع‌رسانی کنار ذخیرهٔ موفق (مثلاً پرشدن سقف داوری هوش مصنوعی).
 */
export type ProductActionState = {
  error?: string;
  ok?: boolean;
  notice?: string;
  values?: Record<string, string>;
  missing?: { label: string; fieldId: string }[];
};

/** لینک دمو/تیزر یا خالی است یا یک نشانی http(s)؛ `javascript:` و `data:` و… پذیرفته نمی‌شوند */
function isHttpOrEmpty(v: string): boolean {
  if (v === "") return true;
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

const productSchema = z.object({
  name: z.string().trim().min(1, "نام محصول را بنویس").max(80, "نام خیلی طولانی است"),
  tagline: z.string().trim().max(160, "تگ‌لاین خیلی طولانی است").optional().default(""),
  description: z.string().trim().max(4000, "توضیح محصول خیلی طولانی است").optional().default(""),
  demoUrl: z
    .string()
    .trim()
    .max(500, "لینک دمو خیلی طولانی است")
    .optional()
    .default("")
    .refine(isHttpOrEmpty, "لینک دمو باید با http:// یا https:// شروع شود"),
  teaserUrl: z
    .string()
    .trim()
    .max(500, "لینک تیزر خیلی طولانی است")
    .optional()
    .default("")
    .refine(isHttpOrEmpty, "لینک تیزر باید با http:// یا https:// شروع شود"),
  images: z
    .array(z.string().trim().max(500))
    .max(MAX_IMAGES)
    .optional()
    .default([])
    // همان قاعدهٔ اعتبارسنجی فوری فرم (product-utils): آپلود محلی یا https روی میزبان‌های مجاز
    .superRefine((arr, ctx) => {
      for (const [i, url] of arr.entries()) {
        const err = imageUrlError(url);
        if (err) {
          ctx.addIssue({ code: "custom", message: `تصویر ${fa(i + 1)}: ${err}` });
          return;
        }
      }
    }),
  price: z.coerce.number().int().min(DEFAULTS.minPrice, `قیمت حداقل ${DEFAULTS.minPrice} است`).max(DEFAULTS.maxPrice, `قیمت حداکثر ${DEFAULTS.maxPrice} است`),
  specialName: z.string().trim().max(80, "نام نسخهٔ ویژه خیلی طولانی است").optional().default(""),
  specialDesc: z.string().trim().max(400, "توضیح نسخهٔ ویژه خیلی طولانی است").optional().default(""),
  specialStart: z.coerce.number().int().min(5, "قیمت شروع حداقل ۵ است").max(100, "قیمت شروع حداکثر ۱۰۰ است"),
  category: z.enum(["", "TECH", "NON_TECH"]).optional().default(""),
  deliverableUrl: z
    .string()
    .trim()
    .max(500, "لینک تحویل خیلی طولانی است")
    .optional()
    .default("")
    .refine(isHttpOrEmpty, "لینک تحویل باید با http:// یا https:// شروع شود"),
  contentType: z.string().trim().max(80, "نوع محتوا خیلی طولانی است").optional().default(""),
  osIssueId: z.string().trim().max(40).optional().default(""),
  preExistingNote: z.string().trim().max(1000, "توضیح کار پیشین خیلی طولانی است").optional().default(""),
});

/** مرکز ساخت برای هر تیم پس از ثبت ایده در همان محور باز است (ترتیب داخلی تیم حفظ می‌شود). */
async function assertEditable(teamId: string, trackId: string) {
  const gate = (await moduleGate("build", teamId)) ?? (await trackGate(trackId, teamId));
  if (gate) return gate;
  const idea = await prisma.idea.findUnique({ where: { teamId_trackId: { teamId, trackId } }, select: { submittedAt: true } });
  if (!idea?.submittedAt) return "اول ایده‌ات را در همین محور ثبت نهایی کن، بعد سراغ ساخت برو";
  return null;
}

/** ذخیرهٔ پیش‌نویس یا ثبت نهایی محصول تیم در یک محور */
export async function saveProductAction(prevState: ProductActionState, formData: FormData): Promise<ProductActionState> {
  const user = await requireUser();
  if (!user.teamId) return { error: "ابتدا باید عضو یک تیم باشی" };
  const accessError = await teamManageError(user);
  if (accessError) return { error: accessError };

  const values = Object.fromEntries(
    ["name", "tagline", "description", "demoUrl", "specialName", "specialDesc", "deliverableUrl", "contentType", "preExistingNote", "category", "osIssueId"].map((k) => [k, String(formData.get(k) ?? "")])
  );

  const trackId = String(formData.get("trackId") ?? "");
  const editError = await assertEditable(user.teamId, trackId);
  if (editError) return { error: editError, values };

  const intent = String(formData.get("intent") ?? "draft");

  // محصول ثبت‌نهایی‌شده فقط پس از «بازکردن برای ویرایش» با پیش‌نویس عوض می‌شود؛
  // وگرنه یک تب قدیمی می‌تواند محتوا را بی‌صدا و بدون داوری دوباره تغییر دهد.
  if (intent !== "submit") {
    const existing = await prisma.product.findUnique({ where: { teamId_trackId: { teamId: user.teamId, trackId } }, select: { submittedAt: true } });
    if (existing?.submittedAt) {
      return { error: "محصول ثبت نهایی شده است؛ برای تغییر، صفحه را تازه کن و ابتدا «بازکردن برای ویرایش» را بزن", values };
    }
  }

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
    category: formData.get("category") ?? "",
    deliverableUrl: formData.get("deliverableUrl") ?? "",
    contentType: formData.get("contentType") ?? "",
    osIssueId: formData.get("osIssueId") ?? "",
    preExistingNote: formData.get("preExistingNote") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "ورودی نامعتبر است", values };
  }

  const data = parsed.data;
  const imagesJson = serializeImages(data.images);
  const track = await getTrack(trackId);
  if (!track) return { error: "محور پیدا نشد", values };
  const osIssueId = track.kind === "OS" && data.osIssueId ? data.osIssueId : null;

  // zod فقط سقف ثابت DEFAULTS.maxPrice را چک می‌کند؛ سقف مؤثر (همان که فرم و چک‌لیست نشان می‌دهند) اینجا بررسی می‌شود.
  const maxPrice = await effectiveMaxPrice();
  if (data.price > maxPrice) {
    return { error: `قیمت حداکثر ${fa(maxPrice)} سکه است`, values };
  }

  if (intent === "submit") {
    const missing = missingForSubmit(
      {
        trackKind: track.kind,
        trackCategory: track.category,
        category: data.category,
        deliverableUrl: data.deliverableUrl,
        name: data.name,
        tagline: data.tagline,
        description: data.description,
        demoUrl: data.demoUrl,
        teaserUrl: data.teaserUrl,
        images: imagesJson,
        price: data.price,
        specialName: data.specialName,
        submittedAt: null,
      },
      maxPrice
    );
    if (missing.length > 0) {
      return {
        error: `پیش از ثبت نهایی، این موارد چک‌لیست را کامل کن: ${missing.map((m) => m.label).join("، ")}`,
        values,
        missing: missing.map((m) => ({ label: m.label, fieldId: m.fieldId })),
      };
    }
  }

  // فاصلهٔ حداقل بین دو ثبت نهایی هر تیم: چرخهٔ «بازکردن ← ثبت» پشت‌سرهم هزینهٔ هوش مصنوعی می‌سازد.
  if (intent === "submit") {
    const cooldown = rateLimit("product-submit", user.teamId, { limit: 1, windowMs: AI_SUBMIT_COOLDOWN_MS });
    if (!cooldown.ok) return { error: aiSubmitCooldownMessage(cooldown.retryAfterSec), values };
  }

  const team = await prisma.team.findUniqueOrThrow({ where: { id: user.teamId }, select: { slug: true } });
  const product = await prisma.product.upsert({
    where: { teamId_trackId: { teamId: user.teamId, trackId } },
    update: {
      category: data.category,
      deliverableUrl: data.deliverableUrl,
      contentType: data.contentType,
      osIssueId,
      preExistingNote: data.preExistingNote,
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
      trackId,
      slug: productSlug(team.slug, trackId),
      category: data.category,
      deliverableUrl: data.deliverableUrl,
      contentType: data.contentType,
      osIssueId,
      preExistingNote: data.preExistingNote,
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

  let notice: string | undefined;
  if (intent === "submit") {
    // حداکثر AI_EVAL_CAP_PER_PHASE بازخورد واقعی هوش مصنوعی برای هر محصول؛ پس از آن نمرهٔ قبلی می‌ماند.
    const { phase } = await getPhase();
    const res = await runCappedAiEval({
      kind: "jury",
      refId: product.id,
      phase,
      cacheKey: `ai:jury:${product.id}`, // همان کلید کش lib/jury-ai.ts
      run: () => runJuryAi(product.id).catch(() => null),
    }).catch(() => null);
    if (res && !res.ran) notice = aiEvalCapMessage("jury");
  }

  revalidatePath("/build");
  return notice ? { ok: true, notice } : { ok: true };
}

/** بازکردن قفل محصول برای ویرایش دوباره (پاک‌کردن submittedAt) */
export async function unsubmitProductAction(trackId: string): Promise<ProductActionState> {
  const user = await requireUser();
  if (!user.teamId) return { error: "ابتدا باید عضو یک تیم باشی" };
  const accessError = await teamManageError(user);
  if (accessError) return { error: accessError };

  const editError = await assertEditable(user.teamId, trackId);
  if (editError) return { error: editError };

  const product = await prisma.product.findUnique({ where: { teamId_trackId: { teamId: user.teamId, trackId } } });
  if (!product) return { error: "هنوز محصولی ثبت نکرده‌ای" };

  await prisma.product.update({ where: { id: product.id }, data: { submittedAt: null } });
  revalidatePath("/build");
  return { ok: true };
}

/** یک بار درخواست ارزیابی مجدد هوش مصنوعی */
export async function requestAiRecheckAction(trackId: string): Promise<ProductActionState> {
  const user = await requireUser();
  if (!user.teamId) return { error: "ابتدا باید عضو یک تیم باشی" };
  const accessError = await teamManageError(user);
  if (accessError) return { error: accessError };
  const gate = await moduleGate("ai", user.teamId);
  if (gate) return { error: gate };

  const product = await prisma.product.findUnique({ where: { teamId_trackId: { teamId: user.teamId, trackId } }, select: { id: true } });
  if (!product) return { error: "هنوز محصولی ثبت نکرده‌ای" };
  const res = await requestAiRecheck(product.id);
  if (res.error) return { error: res.error };
  revalidatePath("/build");
  return { ok: true };
}

export type StudioActionState = { error?: string; ok?: boolean };

/** درخواست انتشار محصول روی «بازار استودیو» (یا ارسال دوباره پس از «نیاز به اصلاح») — هر عضو تیم */
export async function requestGoLiveAction(_prev: StudioActionState, formData: FormData): Promise<StudioActionState> {
  const user = await requireUser();
  const accessError = await teamManageError(user);
  if (accessError) return { error: accessError };

  const result = await requestGoLive(user, String(formData.get("trackId") ?? ""), {
    sourceUrl: String(formData.get("sourceUrl") ?? ""),
    note: String(formData.get("note") ?? ""),
    bazaarPackage: String(formData.get("bazaarPackage") ?? ""),
  });
  if (result.error) return { error: result.error };
  revalidatePath("/build");
  return { ok: true };
}

/** لغو درخواست انتشار (تا پیش از شروع انتشار) */
export async function cancelGoLiveAction(trackId: string): Promise<StudioActionState> {
  const user = await requireUser();
  const accessError = await teamManageError(user);
  if (accessError) return { error: accessError };

  const result = await cancelGoLive(user, trackId);
  if (result.error) return { error: result.error };
  revalidatePath("/build");
  return { ok: true };
}
