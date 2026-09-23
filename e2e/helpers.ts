import type { Page } from "@playwright/test";

/** ایمیل و رمز یکتا برای هر اجرا (جلوگیری از برخورد در سرور در حال اجرا) */
export function uniqueEmail(tag: string) {
  return `e2e-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@tapsell.ir`;
}

export const PASSWORD = "e2e-secret-123";

/** کاربر مدیر seed‌شده در prisma/seed.ts (فقط برای محیط لوکال/تست) */
export const ADMIN_EMAIL = "admin@tapsell.ir";
export const ADMIN_PASSWORD = "admin1234";

/**
 * ثبت‌نام یک کاربر تازه از طریق ویزارد ۵ مرحله‌ای /register و بازگشت به صفحهٔ
 * بعد از ثبت‌نام (معمولاً /team). role/power پیش‌فرض روی گزینهٔ اول هر مرحله است.
 */
export async function registerUser(
  page: Page,
  opts: { email: string; nickname: string; roleLabel?: string; powerLabel?: string; department?: string } = { email: "", nickname: "" }
) {
  await page.goto("/register");

  // مرحله ۱: حساب کاربری
  await page.getByLabel("ایمیل").fill(opts.email);
  await page.getByLabel("رمز عبور").fill(PASSWORD);
  await page.getByLabel("نام مستعار").fill(opts.nickname);
  await page.getByLabel("دپارتمان").selectOption({ index: 1 });
  await page.getByRole("button", { name: "مرحلهٔ بعد" }).click();

  // مرحله ۲: نقش (اولین کارت نقش)
  await page.getByRole("button", { name: new RegExp(opts.roleLabel ?? "سازنده") }).click();
  await page.getByRole("button", { name: "مرحلهٔ بعد" }).click();

  // مرحله ۳: قدرت (اولین کارت قدرت)
  await page.getByRole("button", { name: new RegExp(opts.powerLabel ?? "هیاهو") }).click();
  await page.getByRole("button", { name: "مرحلهٔ بعد" }).click();

  // مرحله ۴: «خودت را کد بزن» — مقادیر پیش‌فرض کافی‌اند، فقط رد می‌شویم
  await page.getByRole("button", { name: "مرحلهٔ بعد" }).click();

  // مرحله ۵: پیش‌نمایش و ثبت نهایی
  await page.getByRole("button", { name: "ثبت‌نام و ورود به میدان" }).click();
}

/** ورود با ایمیل/رمز از طریق /login */
export async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("ایمیل").fill(email);
  await page.getByLabel("رمز عبور").fill(password);
  await page.getByRole("button", { name: "ورود" }).click();
}

/** فاز بازی را از طریق پنل برگزارکننده (/admin) تغییر می‌دهد؛ فرض بر این است که صفحه از قبل به‌عنوان ادمین لاگین است. */
export async function setPhaseViaAdmin(page: Page, phaseLabel: string) {
  await page.goto("/admin");
  await page.getByLabel("فاز").selectOption({ label: phaseLabel });
  await page.getByRole("button", { name: "اعمال" }).click();
}
