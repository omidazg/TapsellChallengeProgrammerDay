/**
 * تبدیل‌های ورودی `<input type="datetime-local">` — فقط در مرورگر فراخوانی شوند.
 * مقدار این ورودی بدون منطقهٔ زمانی است («YYYY-MM-DDTHH:mm») و باید با منطقهٔ زمانی
 * مرورگرِ برگزارکننده تفسیر شود، نه سرور (که در کانتینر معمولاً UTC است).
 */

/** Date → «YYYY-MM-DDTHH:mm» به وقت محلی مرورگر */
export function toLocalInputValue(d: Date): string {
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** «YYYY-MM-DDTHH:mm» محلی مرورگر → رشتهٔ ISO (UTC)؛ خالی/نامعتبر همان ورودی را برمی‌گرداند تا سرور خطا بدهد */
export function localInputToIso(value: string): string {
  const v = value.trim();
  if (!v) return "";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toISOString();
}
