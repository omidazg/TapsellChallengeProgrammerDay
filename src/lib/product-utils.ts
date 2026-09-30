import { fa } from "./persian";
import { DEFAULTS } from "./constants";


/** حداکثر تعداد تصویر مجاز برای محصول */
export const MAX_IMAGES = 6;
export const MIN_IMAGES_FOR_SUBMIT = 3;

export type TeaserKind = "youtube" | "aparat" | "video" | "none";

/** JSON آرایهٔ تصاویر را به لیست امن تبدیل می‌کند */
export function parseImages(json: string): string[] {
  try {
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) return [];
    return arr.filter((u): u is string => typeof u === "string" && u.trim().length > 0).slice(0, MAX_IMAGES);
  } catch {
    return [];
  }
}

export function serializeImages(images: string[]): string {
  return JSON.stringify(images.filter((u) => u.trim().length > 0).slice(0, MAX_IMAGES));
}

/** پوششِ محصول: اولین تصویر یا تصویر پیش‌فرض بر اساس seed */
export function coverUrl(images: string[], seed: string): string {
  return images[0] || `https://picsum.photos/seed/${encodeURIComponent(seed)}/800/500`;
}

/** یک آدرس تصادفی از picsum با seed تصادفی برای دکمهٔ «تصویر تصادفی» */
export function randomPicsumUrl(): string {
  const seed = Math.random().toString(36).slice(2, 10);
  return `https://picsum.photos/seed/${seed}/800/500`;
}

export type UploadResult = { url: string; thumb: string };

/**
 * سقف حجم فایل آپلودی (۵ مگابایت) برای بررسی فوری سمت کلاینت پیش از ارسال.
 * باید با MAX_UPLOAD_BYTES در src/lib/uploads.ts هماهنگ بماند
 * (آن فایل sharp/fs دارد و در کلاینت قابل‌ایمپورت نیست).
 */
export const MAX_UPLOAD_BYTES_CLIENT = 5 * 1024 * 1024;

/** نوع‌های MIME تصویرِ پذیرفته‌شده در آپلود (نوع واقعی را سرور با sharp بررسی می‌کند) */
export const UPLOAD_ACCEPT = "image/jpeg,image/png,image/webp,image/gif";

/**
 * بررسی فوری فایل پیش از آپلود (حجم و نوع اعلامی)؛ پیام فارسی خطا یا `null`.
 * فقط برای بازخورد سریع است و جای بررسی سرور را نمی‌گیرد.
 */
export function uploadFileError(file: File): string | null {
  if (file.size <= 0) return "فایل خالی است";
  if (file.size > MAX_UPLOAD_BYTES_CLIENT) {
    return `حجم فایل ${fa((file.size / (1024 * 1024)).toFixed(1))} مگابایت است؛ حداکثر ${fa(5)} مگابایت مجاز است`;
  }
  if (file.type && !UPLOAD_ACCEPT.split(",").includes(file.type)) {
    return "فقط تصویرهای JPEG، PNG، WebP یا GIF پذیرفته می‌شوند";
  }
  return null;
}

/**
 * آپلود یک فایل تصویر به `/api/upload` (سمت کلاینت).
 * از XMLHttpRequest استفاده می‌شود چون fetch رویداد پیشرفت آپلود ندارد؛
 * `onProgress` کسری بین ۰ و ۱ دریافت می‌کند.
 * در صورت خطا، پیام فارسی برگشتی از سرور را در قالب Error پرتاب می‌کند.
 */
export function uploadImageFile(file: File, onProgress?: (fraction: number) => void): Promise<UploadResult> {
  const formData = new FormData();
  formData.append("file", file);
  return new Promise<UploadResult>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload");
    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && e.total > 0) onProgress(Math.min(1, e.loaded / e.total));
      };
    }
    xhr.onload = () => {
      let data: unknown = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        data = {};
      }
      const obj = (data && typeof data === "object" ? data : {}) as { error?: unknown; url?: unknown; thumb?: unknown };
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(typeof obj.error === "string" ? obj.error : "آپلود با خطا مواجه شد"));
        return;
      }
      resolve({ url: String(obj.url ?? ""), thumb: String(obj.thumb ?? "") });
    };
    xhr.onerror = () => reject(new Error("آپلود با خطا مواجه شد؛ اتصال اینترنت را بررسی کن"));
    xhr.onabort = () => reject(new Error("آپلود لغو شد"));
    xhr.send(formData);
  });
}

/**
 * آیا این نشانی یک تصویر آپلودشدهٔ محلی است؟ (سرویس‌شونده از src/app/uploads/[...path]/route.ts)
 * برای این‌ها می‌توان `next/image` را بدون `unoptimized` استفاده کرد چون مسیر محلی است.
 * توجه: الگوی نام‌گذاری باید با UPLOAD_NAME_RE در src/lib/uploads.ts هماهنگ بماند
 * (اینجا تکرار شده چون uploads.ts از sharp/fs استفاده می‌کند و در کلاینت قابل‌ایمپورت نیست).
 */
export function isLocalUploadUrl(url: string): boolean {
  return /^\/uploads\/[a-f0-9]{64}(-480)?\.webp$/.test(url);
}

/**
 * میزبان‌هایی که در `next.config.ts` برای `next/image` مجاز شده‌اند.
 * هر نشانی خارج از این فهرست باید با تگ سادهٔ <img> نمایش داده شود،
 * وگرنه `next/image` هنگام رندر خطا می‌دهد.
 */
export const NEXT_IMAGE_HOSTS = ["picsum.photos", "images.unsplash.com", "tapsell.com"];

/** آیا این نشانی را می‌توان به `next/image` سپرد؟ */
export function isNextImageHost(url: string): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    return NEXT_IMAGE_HOSTS.includes(u.hostname);
  } catch {
    return false;
  }
}

/**
 * قاعدهٔ مشترک (کلاینت و سرور) برای نشانی تصویر ایده/محصول: یا یک فایل آپلودشدهٔ
 * محلی (`/uploads/<hash>.webp`) یا یک نشانی https روی یکی از میزبان‌های مجاز
 * next.config.ts؛ هیچ میزبان دلخواه دیگری پذیرفته نمی‌شود (جلوگیری از تصاویر
 * ردیاب/میزبان‌های ناشناس). خروجی: پیام خطای مشخص فارسی یا `null` (نشانی خالی مجاز است).
 */
export function imageUrlError(raw: string): string | null {
  const v = raw.trim();
  if (v === "") return null;
  if (v.length > 500) return "نشانی تصویر خیلی طولانی است";
  if (v.startsWith("/uploads/")) {
    return isLocalUploadUrl(v) ? null : "نشانی فایل آپلودی نامعتبر است؛ تصویر را دوباره آپلود کن";
  }
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    return "نشانی تصویر معتبر نیست؛ باید با https:// شروع شود";
  }
  if (u.protocol !== "https:") return "نشانی تصویر باید با https:// شروع شود";
  if (!NEXT_IMAGE_HOSTS.includes(u.hostname)) {
    return `میزبان «${u.hostname}» مجاز نیست؛ فقط ${NEXT_IMAGE_HOSTS.join("، ")} یا آپلود از رایانه`;
  }
  return null;
}

/** نسخهٔ بولی {@link imageUrlError} برای اعتبارسنجی سرور */
export function isAllowedImageUrl(v: string): boolean {
  return imageUrlError(v) === null;
}

/** تشخیص نوع تیزر و ساخت آدرس embed مناسب */
export function parseTeaser(url: string): { kind: TeaserKind; embedSrc?: string } {
  const u = (url || "").trim();
  if (!u) return { kind: "none" };
  try {
    const parsed = new URL(u);
    // فقط http(s)؛ نشانی‌هایی مثل javascript: یا data: نباید در iframe/video رندر شوند
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return { kind: "none" };
    const host = parsed.hostname.replace(/^www\./, "");
    if (host === "youtube.com" || host === "m.youtube.com") {
      const id = parsed.searchParams.get("v");
      if (id) return { kind: "youtube", embedSrc: `https://www.youtube.com/embed/${encodeURIComponent(id)}` };
      const parts = parsed.pathname.split("/").filter(Boolean);
      if (parts[0] === "embed" && parts[1]) return { kind: "youtube", embedSrc: `https://www.youtube.com/embed/${encodeURIComponent(parts[1])}` };
      if (parts[0] === "shorts" && parts[1]) return { kind: "youtube", embedSrc: `https://www.youtube.com/embed/${encodeURIComponent(parts[1])}` };
      return { kind: "video", embedSrc: u };
    }
    if (host === "youtu.be") {
      const id = parsed.pathname.replace(/^\//, "");
      if (id) return { kind: "youtube", embedSrc: `https://www.youtube.com/embed/${encodeURIComponent(id)}` };
      return { kind: "video", embedSrc: u };
    }
    if (host === "aparat.com") {
      const parts = parsed.pathname.split("/").filter(Boolean);
      // /v/<hash> یا /video/video/embed/videohash/<hash>/...
      let hash: string | null = null;
      if (parts[0] === "v" && parts[1]) hash = parts[1];
      const vhIdx = parts.indexOf("videohash");
      if (vhIdx >= 0 && parts[vhIdx + 1]) hash = parts[vhIdx + 1];
      if (hash) return { kind: "aparat", embedSrc: `https://www.aparat.com/video/video/embed/videohash/${encodeURIComponent(hash)}/vt/frame` };
      return { kind: "video", embedSrc: u };
    }
    return { kind: "video", embedSrc: u };
  } catch {
    return { kind: "none" };
  }
}

/**
 * `fieldId`: شناسهٔ فیلد مرتبط در فرم مرکز ساخت (BuildForm) تا کلیک روی مورد چک‌لیست
 * به همان فیلد اسکرول و فوکوس کند.
 */
export type ChecklistItem = { key: string; label: string; done: boolean; fieldId: string };

export type ProductForChecklist = {
  name: string;
  tagline: string;
  description: string;
  demoUrl: string;
  teaserUrl: string;
  images: string;
  price: number;
  specialName: string;
  submittedAt: Date | null;
};

/**
 * چک‌لیست تکمیل صفحهٔ محصول برای «مرکز ساخت».
 * `maxPrice`: سقف مؤثر قیمت (هرگز بیشتر از سقف خرید هر نفر روی یک محصول نباشد، وگرنه
 * محصول برای هیچ خریداری قابل خرید نمی‌ماند)؛ پیش‌فرض DEFAULTS.maxPrice برای فراخوان‌های قدیمی.
 */
export function buildChecklist(p: ProductForChecklist, maxPrice: number = DEFAULTS.maxPrice): ChecklistItem[] {
  const images = parseImages(p.images);
  const hasName = p.name.trim().length > 0;
  return [
    // اگر نام پر است ولی توضیح نه، کلیک به فیلد توضیح می‌رود
    { key: "name", label: "نام و توضیح", done: hasName && p.description.trim().length > 0, fieldId: hasName ? "description" : "name" },
    { key: "demo", label: "لینک دمو", done: p.demoUrl.trim().length > 0, fieldId: "demoUrl" },
    { key: "teaser", label: "تیزر", done: p.teaserUrl.trim().length > 0, fieldId: "teaserUrl" },
    { key: "images", label: `حداقل ${fa(MIN_IMAGES_FOR_SUBMIT)} تصویر`, done: images.length >= MIN_IMAGES_FOR_SUBMIT, fieldId: "productImageUrl" },
    { key: "price", label: "قیمت", done: p.price >= DEFAULTS.minPrice && p.price <= maxPrice, fieldId: "price" },
    { key: "special", label: "نسخهٔ ویژه", done: p.specialName.trim().length > 0, fieldId: "specialName" },
    { key: "submit", label: "ثبت نهایی", done: !!p.submittedAt, fieldId: "productFinalSubmit" },
  ];
}

/** موارد انجام‌نشدهٔ چک‌لیست که مانع «ثبت نهایی» هستند (به‌جز خودِ ثبت) */
export function missingForSubmit(p: ProductForChecklist, maxPrice: number = DEFAULTS.maxPrice): ChecklistItem[] {
  return buildChecklist(p, maxPrice).filter((i) => i.key !== "submit" && !i.done);
}

export function checklistProgress(items: ChecklistItem[]): number {
  if (items.length === 0) return 0;
  return items.filter((i) => i.done).length / items.length;
}

/** آیا همهٔ الزامات لازم برای «ثبت نهایی» فراهم است (به‌جز خودِ ثبت) */
export function readyToSubmit(p: ProductForChecklist, maxPrice: number = DEFAULTS.maxPrice): boolean {
  return missingForSubmit(p, maxPrice).length === 0;
}

