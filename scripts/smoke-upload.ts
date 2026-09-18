/**
 * دود-تست src/lib/uploads.ts — بدون نیاز به دیتابیس یا سرور.
 * اجرا:
 *   npx tsx scripts/smoke-upload.ts
 *
 * از یک UPLOAD_DIR موقت استفاده می‌کند (قبل از import ماژول تنظیم می‌شود، چون
 * uploads.ts مقدار UPLOAD_DIR را در زمان import می‌خواند) و در پایان آن را پاک می‌کند.
 */
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, extra = "") {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name} ${extra}`);
  }
}

async function main() {
  const tmpDir = await mkdtemp(path.join(tmpdir(), "arena-upload-smoke-"));
  process.env.UPLOAD_DIR = tmpDir;

  // uploads.ts می‌خواند process.env.UPLOAD_DIR را در زمان import، پس باید بعد از
  // تنظیم متغیر بالا import شود (dynamic import).
  const { saveImage, UploadError, isValidUploadName } = await import("../src/lib/uploads");

  try {
    console.log("\n# ۱ — آپلود یک تصویر معتبر (عریض‌تر از ۱۶۰۰px)");
    const wideJpeg = await sharp({
      create: { width: 2000, height: 1000, channels: 3, background: { r: 100, g: 150, b: 200 } },
    })
      .jpeg()
      .toBuffer();
    const file1 = new File([new Uint8Array(wideJpeg)], "wide.jpg", { type: "image/jpeg" });

    const result1 = await saveImage(file1, "smoke-user");
    check("خروجی url با /uploads/ شروع و به .webp ختم می‌شود", result1.url.startsWith("/uploads/") && result1.url.endsWith(".webp"), result1.url);
    check("خروجی thumb با -480.webp ختم می‌شود", result1.thumb.endsWith("-480.webp"), result1.thumb);

    const mainName = result1.url.replace("/uploads/", "");
    const thumbName = result1.thumb.replace("/uploads/", "");
    check("نام فایل اصلی الگوی مجاز را دارد", isValidUploadName(mainName), mainName);
    check("نام فایل بندانگشتی الگوی مجاز را دارد", isValidUploadName(thumbName), thumbName);

    const mainPath = path.join(tmpDir, mainName);
    const thumbPath = path.join(tmpDir, thumbName);
    // از بافر می‌خوانیم نه مسیر فایل، تا روی ویندوز هندل فایل باز نماند
    // (که هنگام پاک‌سازی پوشهٔ موقت باعث خطای EBUSY می‌شود).
    const mainMeta = await sharp(await readFile(mainPath)).metadata();
    const thumbMeta = await sharp(await readFile(thumbPath)).metadata();

    check("فرمت خروجی اصلی webp است", mainMeta.format === "webp", String(mainMeta.format));
    check("عرض تصویر اصلی حداکثر ۱۶۰۰px است", !!mainMeta.width && mainMeta.width <= 1600, String(mainMeta.width));
    check("بندانگشتی وجود دارد و فرمت آن webp است", thumbMeta.format === "webp", String(thumbMeta.format));
    check("عرض بندانگشتی حداکثر ۴۸۰px است", !!thumbMeta.width && thumbMeta.width <= 480, String(thumbMeta.width));

    console.log("\n# ۲ — همان ورودی → همان نام فایل (تغییرناپذیر/محتوامحور)");
    const file2 = new File([new Uint8Array(wideJpeg)], "wide-again.jpg", { type: "image/jpeg" });
    const result2 = await saveImage(file2, "smoke-user-2");
    check("نشانی خروجی برای ورودی یکسان تکرار می‌شود", result2.url === result1.url, `${result2.url} vs ${result1.url}`);

    const filesAfter = await readdir(tmpDir);
    check("فایل تکراری دوباره نوشته نشده (فقط ۲ فایل: اصلی + بندانگشتی)", filesAfter.length === 2, JSON.stringify(filesAfter));

    console.log("\n# ۳ — فایل غیرتصویری رد می‌شود");
    const fakeBytes = Buffer.from("این یک فایل تصویری نیست، فقط متن است.", "utf-8");
    const fakeFile = new File([new Uint8Array(fakeBytes)], "fake.png", { type: "image/png" });
    let fakeRejected = false;
    let fakeError: unknown;
    try {
      await saveImage(fakeFile, "smoke-user");
    } catch (e) {
      fakeRejected = e instanceof UploadError;
      fakeError = e;
    }
    check("فایل غیرتصویری با UploadError رد می‌شود", fakeRejected, String(fakeError));

    console.log("\n# ۴ — فایل بیش از حجم مجاز رد می‌شود");
    const oversizeBytes = Buffer.alloc(6 * 1024 * 1024, 1); // ۶ مگابایت > سقف ۵ مگابایتی
    const oversizeFile = new File([new Uint8Array(oversizeBytes)], "big.jpg", { type: "image/jpeg" });
    let oversizeRejected = false;
    let oversizeError: unknown;
    try {
      await saveImage(oversizeFile, "smoke-user");
    } catch (e) {
      oversizeRejected = e instanceof UploadError;
      oversizeError = e;
    }
    check("فایل بیش‌ازحد بزرگ با UploadError رد می‌شود", oversizeRejected, String(oversizeError));
    check(
      "پیام خطا دربارهٔ حجم فایل است",
      oversizeError instanceof UploadError && oversizeError.message.includes("مگابایت"),
      String(oversizeError)
    );
  } finally {
    console.log("\n# پاک‌سازی");
    // روی ویندوز گاهی هندل فایل کمی دیرتر آزاد می‌شود (EBUSY)؛ چند بار تلاش می‌کنیم.
    await rm(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    console.log(`  پوشهٔ موقت حذف شد: ${tmpDir}`);
    console.log(`\nنتیجه: ${pass} موفق، ${fail} ناموفق`);
  }
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
