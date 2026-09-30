/**
 * نشانی بندانگشتی (۴۸۰ پیکسلی) یک تصویر آپلودشدهٔ محلی.
 *
 * `/api/upload` برای هر تصویر علاوه بر نسخهٔ کامل (`<hash>.webp`) یک بندانگشتی
 * `<hash>-480.webp` هم می‌سازد (src/lib/uploads.ts)؛ در گرید و فهرست‌ها همین نسخهٔ سبک
 * کافی است. نشانی‌های بیرونی (picsum و …) یا نشانی‌ای که خودش بندانگشتی است بدون تغییر
 * برمی‌گردند. تابع خالص است و در کلاینت هم قابل‌استفاده است.
 * توجه: الگو باید با UPLOAD_NAME_RE در src/lib/uploads.ts هماهنگ بماند.
 */
export function thumbUrl(url: string): string {
  const m = /^\/uploads\/([a-f0-9]{64})\.webp$/.exec(url);
  return m ? `/uploads/${m[1]}-480.webp` : url;
}
