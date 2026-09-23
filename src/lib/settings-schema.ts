import { z } from "zod";
import { SCHEDULER_SETTING_KINDS, type SchedulerSettingKey, type SettingKey } from "./admin";

/**
 * پایپ‌لاین واحد اعتبارسنجی/ذخیرهٔ تنظیمات ادمین.
 * هم فرم تنظیمات بازی (SETTING_KEYS در actions.ts) و هم فرم زمان‌بند خودکار
 * (SCHEDULER_SETTING_KEYS در scheduler-actions.ts) از همین یک اسکیمای zod
 * (با pick روی زیرمجموعهٔ خودشان) و همین یک تابع ذخیره استفاده می‌کنند،
 * تا رفتار اعتبارسنجی و پیام خطاها بین دو مسیر یکی بماند.
 */

const numeric01 = z.enum(["0", "1"]);
const nonNegativeInt = z.coerce
  .number({ error: "مقدار عددی نامعتبر است" })
  .min(0, "مقدار عددی نامعتبر است")
  .transform((n) => Math.trunc(n));

/** یک اسکیمای واحد برای همهٔ کلیدهای تنظیمات (بازی + زمان‌بند) */
export const settingsSchema = z.object({
  // تنظیمات بازی
  seed_wallet: z.coerce.number().int().min(0),
  buy_wallet: z.coerce.number().int().min(0),
  max_per_target: z.coerce.number().int().min(1),
  penalty_per_coin: z.coerce.number().min(0),
  bid_increment: z.coerce.number().int().min(1),
  auction_duration_sec: z.coerce.number().int().min(10),
  market_starts_at: z
    .string()
    .optional()
    .default("")
    .refine((v) => v === "" || !Number.isNaN(new Date(v).getTime()), "زمان شروع روز بازار نامعتبر است"),
  // تنظیمات زمان‌بند خودکار
  auto_advance: numeric01,
  auto_auction: numeric01,
  auction_gap_sec: nonNegativeInt,
  phase_hours_IDEATION: nonNegativeInt,
  phase_hours_SEED_ROUND: nonNegativeInt,
  phase_hours_BUILD: nonNegativeInt,
  phase_hours_MARKET: nonNegativeInt,
  phase_hours_AUCTION: nonNegativeInt,
});

export const gameSettingsSchema = settingsSchema.pick({
  seed_wallet: true,
  buy_wallet: true,
  max_per_target: true,
  penalty_per_coin: true,
  bid_increment: true,
  auction_duration_sec: true,
  market_starts_at: true,
});
export type GameSettingsInput = z.infer<typeof gameSettingsSchema>;

export const schedulerSettingsSchema = settingsSchema.pick({
  auto_advance: true,
  auto_auction: true,
  auction_gap_sec: true,
  phase_hours_IDEATION: true,
  phase_hours_SEED_ROUND: true,
  phase_hours_BUILD: true,
  phase_hours_MARKET: true,
  phase_hours_AUCTION: true,
});
export type SchedulerSettingsInput = z.infer<typeof schedulerSettingsSchema>;

type Kind = "number" | "datetime" | "boolean";
// تگ صریح `ok` (نه truthiness رشتهٔ خطا) تا TypeScript بتواند اتحاد را درست باریک کند.
export type ParseResult<T> = { ok: true; data: T } | { ok: false; error: string };

/** خواندن مقادیر خام از FormData؛ فیلد خالی/غایب (به‌جز boolean و datetime) رد می‌شود */
function extractRaw(formData: FormData, keys: readonly string[], kindOf: (key: string) => Kind): ParseResult<Record<string, string>> {
  const raw: Record<string, string> = {};
  for (const key of keys) {
    const kind = kindOf(key);
    if (kind === "boolean") {
      // چک‌باکس خالی اصلاً در FormData نمی‌آید؛ غیاب آن یعنی «خاموش».
      raw[key] = formData.get(key) === "1" ? "1" : "0";
      continue;
    }
    const value = formData.get(key);
    // فیلد خالی/غایب نباید بی‌سروصدا صفر شود (جز زمان شروع بازار که اختیاری است)
    if (typeof value !== "string" || (value.trim() === "" && kind !== "datetime")) {
      return { ok: false, error: "همهٔ مقادیر عددی را پر کن" };
    }
    raw[key] = value.trim();
  }
  return { ok: true, data: raw };
}

/** اعتبارسنجی تنظیمات بازی از FormData با اسکیمای مشترک */
export function parseGameSettings(formData: FormData): ParseResult<GameSettingsInput> {
  const extracted = extractRaw(formData, Object.keys(gameSettingsSchema.shape), (key) => (key === "market_starts_at" ? "datetime" : "number"));
  if (!extracted.ok) return extracted;
  const parsed = gameSettingsSchema.safeParse(extracted.data);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "ورودی نامعتبر است" };
  return { ok: true, data: parsed.data };
}

/** اعتبارسنجی تنظیمات زمان‌بند از FormData با اسکیمای مشترک */
export function parseSchedulerSettings(formData: FormData): ParseResult<SchedulerSettingsInput> {
  const extracted = extractRaw(
    formData,
    Object.keys(schedulerSettingsSchema.shape),
    (key) => SCHEDULER_SETTING_KINDS[key as SchedulerSettingKey]
  );
  if (!extracted.ok) return extracted;
  const parsed = schedulerSettingsSchema.safeParse(extracted.data);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "ورودی نامعتبر است" };
  return { ok: true, data: parsed.data };
}

/**
 * ذخیرهٔ یک دستهٔ تنظیمات با تابع نویسندهٔ داده‌شده (معمولاً `setSetting` از lib/admin).
 * مقادیر «بعد از ذخیره» (به‌صورت رشته، مطابق ستون Setting.value) را برمی‌گرداند
 * تا فراخوان بتواند برای AuditLog از آن استفاده کند.
 */
export async function saveSettings<T extends Record<string, string | number>>(
  data: T,
  setSetting: (key: string, value: string) => Promise<void>
): Promise<Record<keyof T, string>> {
  const after = {} as Record<keyof T, string>;
  for (const key of Object.keys(data) as (keyof T)[]) after[key] = String(data[key]);
  await Promise.all((Object.keys(after) as (keyof T)[]).map((key) => setSetting(String(key), after[key])));
  return after;
}

export type { SettingKey };
