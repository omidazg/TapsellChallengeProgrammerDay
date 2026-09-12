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

/** تشخیص نوع تیزر و ساخت آدرس embed مناسب */
export function parseTeaser(url: string): { kind: TeaserKind; embedSrc?: string } {
  const u = (url || "").trim();
  if (!u) return { kind: "none" };
  try {
    const parsed = new URL(u);
    const host = parsed.hostname.replace(/^www\./, "");
    if (host === "youtube.com" || host === "m.youtube.com") {
      const id = parsed.searchParams.get("v");
      if (id) return { kind: "youtube", embedSrc: `https://www.youtube.com/embed/${id}` };
      const parts = parsed.pathname.split("/").filter(Boolean);
      if (parts[0] === "embed" && parts[1]) return { kind: "youtube", embedSrc: `https://www.youtube.com/embed/${parts[1]}` };
      if (parts[0] === "shorts" && parts[1]) return { kind: "youtube", embedSrc: `https://www.youtube.com/embed/${parts[1]}` };
      return { kind: "video", embedSrc: u };
    }
    if (host === "youtu.be") {
      const id = parsed.pathname.replace(/^\//, "");
      if (id) return { kind: "youtube", embedSrc: `https://www.youtube.com/embed/${id}` };
      return { kind: "video", embedSrc: u };
    }
    if (host === "aparat.com") {
      const parts = parsed.pathname.split("/").filter(Boolean);
      // /v/<hash> یا /video/video/embed/videohash/<hash>/...
      let hash: string | null = null;
      if (parts[0] === "v" && parts[1]) hash = parts[1];
      const vhIdx = parts.indexOf("videohash");
      if (vhIdx >= 0 && parts[vhIdx + 1]) hash = parts[vhIdx + 1];
      if (hash) return { kind: "aparat", embedSrc: `https://www.aparat.com/video/video/embed/videohash/${hash}/vt/frame` };
      return { kind: "video", embedSrc: u };
    }
    return { kind: "video", embedSrc: u };
  } catch {
    return { kind: "none" };
  }
}

export type ChecklistItem = { key: string; label: string; done: boolean };

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

/** چک‌لیست تکمیل صفحهٔ محصول برای «مرکز ساخت» */
export function buildChecklist(p: ProductForChecklist): ChecklistItem[] {
  const images = parseImages(p.images);
  return [
    { key: "name", label: "نام و توضیح", done: p.name.trim().length > 0 && p.description.trim().length > 0 },
    { key: "demo", label: "لینک دمو", done: p.demoUrl.trim().length > 0 },
    { key: "teaser", label: "تیزر", done: p.teaserUrl.trim().length > 0 },
    { key: "images", label: `حداقل ${fa(MIN_IMAGES_FOR_SUBMIT)} تصویر`, done: images.length >= MIN_IMAGES_FOR_SUBMIT },
    { key: "price", label: "قیمت", done: p.price >= DEFAULTS.minPrice && p.price <= DEFAULTS.maxPrice },
    { key: "special", label: "نسخهٔ ویژه", done: p.specialName.trim().length > 0 },
    { key: "submit", label: "ثبت نهایی", done: !!p.submittedAt },
  ];
}

export function checklistProgress(items: ChecklistItem[]): number {
  if (items.length === 0) return 0;
  return items.filter((i) => i.done).length / items.length;
}

/** آیا همهٔ الزامات لازم برای «ثبت نهایی» فراهم است (به‌جز خودِ ثبت) */
export function readyToSubmit(p: ProductForChecklist): boolean {
  return buildChecklist(p)
    .filter((i) => i.key !== "submit")
    .every((i) => i.done);
}

