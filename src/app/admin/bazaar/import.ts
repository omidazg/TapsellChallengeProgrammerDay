/**
 * خواندن فایل اکسل آمار بازار. ستون‌ها از روی عنوان سطر اول پیدا می‌شوند (فارسی یا انگلیسی).
 * ستون جاافتاده یا سلول عددی خالی رد می‌شود تا آمار قبلی محصول بی‌سروصدا صفر نشود.
 */
import ExcelJS from "exceljs";
import type { BazaarImportRow } from "@/lib/bazaar";

/** بیشترین مقدار ستون Int در Prisma */
export const MAX_STAT_VALUE = 2_147_483_647;

const HEADERS = {
  key: ["package", "packagename", "bazaarpackage", "slug", "key", "شناسهبسته", "بسته", "شناسه", "نشانی"],
  activeInstalls: ["activeinstalls", "installs", "نصبفعال", "نصب"],
  revenueToman: ["revenuetoman", "revenue", "درآمدتومان", "درآمد", "درآمدواقعی"],
  rating: ["rating", "امتیاز", "امتیازستارهای", "ستاره"],
  commentCount: ["commentcount", "comments", "تعدادنظر", "نظر"],
} as const;
type Column = keyof typeof HEADERS;
const COLUMNS = Object.keys(HEADERS) as Column[];
const COLUMN_LABEL: Record<Column, string> = {
  key: "شناسهٔ بسته",
  activeInstalls: "نصب فعال",
  revenueToman: "درآمد",
  rating: "امتیاز",
  commentCount: "تعداد نظر",
};

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

function normalizeHeader(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[\s_\-()‌ٔ]/g, "");
}

/** مقدار سلول exceljs به متن ساده (فرمول، متن غنی و لینک هم پوشش داده می‌شوند) */
function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    if (value instanceof Date) return value.toISOString();
    if ("result" in value) return value.result === undefined ? "" : cellText(value.result as ExcelJS.CellValue);
    if ("richText" in value) return value.richText.map((t) => t.text).join("");
    if ("text" in value) return String(value.text);
    return "";
  }
  return String(value).trim();
}

/** عدد از متن سلول: رقم فارسی/عربی و جداکنندهٔ هزارگان پذیرفته می‌شود. */
function cleanNumber(text: string): string {
  return text
    .replace(/[۰-۹]/g, (d) => String(PERSIAN_DIGITS.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d)))
    .replace(/[,٬\s]/g, "")
    .replace(/٫/g, ".");
}

export type ParsedSheet = { error: string } | { rows: BazaarImportRow[]; rejected: string[] };

export async function parseBazaarWorkbook(data: ArrayBuffer): Promise<ParsedSheet> {
  const workbook = new ExcelJS.Workbook();
  try {
    // exceljs بافر خودش را با اینترفیس سفارشی تایپ کرده است؛ فقط در مرز عبور cast می‌کنیم.
    await workbook.xlsx.load(data as never);
  } catch {
    return { error: "فایل اکسل خوانده نشد؛ فایل xlsx معتبر بفرست." };
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) return { error: "فایل هیچ برگه‌ای ندارد." };

  const columns = new Map<Column, number>();
  sheet.getRow(1).eachCell((cell, colNumber) => {
    const header = normalizeHeader(cellText(cell.value));
    for (const col of COLUMNS) {
      if (!columns.has(col) && (HEADERS[col] as readonly string[]).includes(header)) columns.set(col, colNumber);
    }
  });
  const missing = COLUMNS.filter((c) => !columns.has(c));
  if (missing.length > 0) return { error: `این ستون‌ها در سطر اول پیدا نشد: ${missing.map((c) => COLUMN_LABEL[c]).join("، ")}` };

  const rows: BazaarImportRow[] = [];
  const rejected: string[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const read = (col: Column) => cellText(row.getCell(columns.get(col)!).value);
    const key = read("key");
    const installs = cleanNumber(read("activeInstalls"));
    const revenue = cleanNumber(read("revenueToman"));
    const comments = cleanNumber(read("commentCount"));
    const rating = cleanNumber(read("rating"));
    if (!key && !installs && !revenue && !comments && !rating) return; // سطر خالی
    const numbers = [installs, revenue, comments];
    if (!key || numbers.some((n) => n === "" || Number.isNaN(Number(n)) || Number(n) > MAX_STAT_VALUE)) {
      rejected.push(key || `سطر ${rowNumber}`);
      return;
    }
    rows.push({
      key,
      activeInstalls: Number(installs),
      revenueToman: Number(revenue),
      commentCount: Number(comments),
      rating: rating === "" ? null : Number(rating),
    });
  });
  return { rows, rejected };
}
