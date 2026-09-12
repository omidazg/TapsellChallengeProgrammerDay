import jalaali from "jalaali-js";

const FA_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];

/** تبدیل اعداد به رقم فارسی با جداکنندهٔ هزارگان */
export function fa(n: number | string | null | undefined, opts: { sep?: boolean } = { sep: true }): string {
  if (n === null || n === undefined) return "";
  let s = typeof n === "number" ? (opts.sep ? n.toLocaleString("en-US") : String(n)) : n;
  s = s.replace(/[0-9]/g, (d) => FA_DIGITS[parseInt(d, 10)]);
  return s.replace(/,/g, "٬");
}

export function toEnDigits(s: string) {
  return s.replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d))).replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
}

const JMONTHS = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"];
const WEEKDAYS = ["یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه", "شنبه"];

/** تاریخ شمسی: «سه‌شنبه ۲۲ شهریور ۱۴۰۵» */
export function jdate(d: Date, withWeekday = true) {
  const { jy, jm, jd } = jalaali.toJalaali(d);
  const wd = WEEKDAYS[d.getDay()];
  return `${withWeekday ? wd + " " : ""}${fa(jd, { sep: false })} ${JMONTHS[jm - 1]} ${fa(jy, { sep: false })}`;
}

export function jtime(d: Date) {
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  return fa(`${h}:${m}`);
}

export function jdatetime(d: Date) {
  return `${jdate(d)}، ساعت ${jtime(d)}`;
}

/** «۲ ساعت و ۱۵ دقیقه» */
export function duration(ms: number) {
  if (ms <= 0) return "پایان یافته";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const parts: string[] = [];
  if (d) parts.push(`${fa(d)} روز`);
  if (h) parts.push(`${fa(h)} ساعت`);
  if (m || parts.length === 0) parts.push(`${fa(m)} دقیقه`);
  return parts.join(" و ");
}

export function coins(n: number) {
  return `${fa(n)} سکه`;
}
