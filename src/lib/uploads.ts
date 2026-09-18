import { createHash } from "node:crypto";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

/**
 * پوشهٔ ذخیرهٔ تصاویر آپلودشده.
 * در تولید (Docker) روی `/app/data/uploads` می‌نشیند که بخشی از حجم دادهٔ
 * پایدار (`/srv/arena/data`) است؛ در توسعه کنار پروژه در `./data/uploads`.
 * با `UPLOAD_DIR` قابل بازنویسی است.
 */
export const UPLOAD_DIR =
  process.env.UPLOAD_DIR ?? (process.env.NODE_ENV === "production" ? "/app/data/uploads" : path.join(process.cwd(), "data", "uploads"));

/** پیشوند نشانی عمومی برای فایل‌های آپلودشده (سرویس‌شونده توسط src/app/uploads/[...path]/route.ts) */
export const UPLOAD_URL_PREFIX = "/uploads/";

const MAX_INPUT_BYTES = 5 * 1024 * 1024; // ۵ مگابایت
const MAX_MEGAPIXELS = 40_000_000; // ۴۰ مگاپیکسل
const MAX_WIDTH = 1600;
const THUMB_WIDTH = 480;
const WEBP_QUALITY = 80;

const ALLOWED_FORMATS = new Set(["jpeg", "png", "webp", "gif"]);

/** نام فایل آپلودشده باید دقیقاً این شکل را داشته باشد (بدون امکان traversal) */
const UPLOAD_NAME_RE = /^[a-f0-9]{64}(-480)?\.webp$/;

export function isValidUploadName(name: string): boolean {
  return UPLOAD_NAME_RE.test(name);
}

/** خطای قابل‌نمایش به کاربر (پیام فارسی) هنگام رد یک آپلود */
export class UploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadError";
  }
}

export type SavedImage = { url: string; thumb: string };

/**
 * یک فایل تصویر آپلودی را بازرسی، بهینه و ذخیره می‌کند.
 *
 * - نوع واقعی فایل از روی بایت‌های آن (نه MIME اعلامی) با sharp تشخیص داده می‌شود.
 * - جهت تصویر بر اساس EXIF اصلاح و همهٔ ابرداده‌ها حذف می‌شود.
 * - عرض تصویر اصلی حداکثر ۱۶۰۰px و یک نسخهٔ بندانگشتی ۴۸۰px هم تولید می‌شود.
 * - نام فایل بر پایهٔ sha256 خروجی است، پس آپلود یکسان همیشه همان فایل را می‌دهد
 *   (تغییرناپذیر — می‌توان آن را برای همیشه کش کرد).
 */
export async function saveImage(file: File, _userId: string): Promise<SavedImage> {
  if (!(file instanceof File)) throw new UploadError("فایل نامعتبر است");
  if (file.size <= 0) throw new UploadError("فایل خالی است");
  if (file.size > MAX_INPUT_BYTES) throw new UploadError("حجم فایل نباید بیشتر از ۵ مگابایت باشد");

  const input = Buffer.from(await file.arrayBuffer());

  let format: string | undefined;
  let width: number | undefined;
  let height: number | undefined;
  try {
    const metadata = await sharp(input).metadata();
    format = metadata.format;
    width = metadata.width;
    height = metadata.height;
  } catch {
    throw new UploadError("فایل تصویر معتبر نیست");
  }

  if (!format || !ALLOWED_FORMATS.has(format)) {
    throw new UploadError("فقط تصاویر JPEG، PNG، WebP یا GIF مجاز است");
  }
  if (!width || !height || width <= 0 || height <= 0) {
    throw new UploadError("فایل تصویر معتبر نیست");
  }
  if (width * height > MAX_MEGAPIXELS) {
    throw new UploadError("ابعاد تصویر خیلی بزرگ است");
  }

  let mainBuffer: Buffer;
  let thumbBuffer: Buffer;
  try {
    const makePipeline = () => sharp(input, { limitInputPixels: MAX_MEGAPIXELS }).rotate();
    mainBuffer = await makePipeline().resize({ width: MAX_WIDTH, withoutEnlargement: true }).webp({ quality: WEBP_QUALITY }).toBuffer();
    thumbBuffer = await makePipeline().resize({ width: THUMB_WIDTH, withoutEnlargement: true }).webp({ quality: WEBP_QUALITY }).toBuffer();
  } catch {
    throw new UploadError("پردازش تصویر با خطا مواجه شد");
  }

  const hash = createHash("sha256").update(mainBuffer).digest("hex");
  const mainName = `${hash}.webp`;
  const thumbName = `${hash}-480.webp`;

  await mkdir(UPLOAD_DIR, { recursive: true });
  await writeIfMissing(path.join(UPLOAD_DIR, mainName), mainBuffer);
  await writeIfMissing(path.join(UPLOAD_DIR, thumbName), thumbBuffer);

  return { url: `${UPLOAD_URL_PREFIX}${mainName}`, thumb: `${UPLOAD_URL_PREFIX}${thumbName}` };
}

async function writeIfMissing(filePath: string, data: Buffer): Promise<void> {
  try {
    await stat(filePath);
    return; // محتوامحور و تغییرناپذیر: اگر از قبل هست، دوباره نمی‌نویسیم
  } catch {
    // پیدا نشد؛ می‌نویسیم
  }
  await writeFile(filePath, data);
}
