import { expect, type Page } from "@playwright/test";

/** ایمیل و رمز یکتا برای هر اجرا (جلوگیری از برخورد در سرور در حال اجرا) */
export function uniqueEmail(tag: string) {
  return `e2e-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@tapsell.ir`;
}

export const PASSWORD = "e2e-secret-123";

/** کاربر مدیر seed‌شده در prisma/seed.ts (فقط برای محیط لوکال/تست) */
export const ADMIN_EMAIL = "admin@tapsell.ir";
export const ADMIN_PASSWORD = "admin1234";

/**
 * ثبت‌نام یک کاربر تازه از طریق ویزارد ۵ مرحله‌ای /register.
 * role/power پیش‌فرض روی گزینهٔ اول هر مرحله است.
 *
 * ثبت‌نام موفق به `/?welcome=1` می‌رود و راهنمای شروع (OnboardingTour) را
 * به‌صورت خودکار باز می‌کند. آن مودال focus-trap و بک‌دراپ دارد، پس اگر بسته
 * نشود هر کلیک و Tab بعدیِ تست را می‌بلعد. این کمک‌تابع مودال را می‌بندد و
 * سپس به /team می‌رود تا قرارداد قبلی («بعد از ثبت‌نام روی /team هستیم») حفظ شود.
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

  // ثبت‌نام تمام شده وقتی از /register خارج شدیم.
  await page.waitForURL((url) => !url.pathname.startsWith("/register"));

  // راهنمای شروع را ببند (اگر باز شد). markSeen در localStorage ذخیره می‌کند،
  // پس در ادامهٔ همین کانتکست دیگر باز نمی‌شود.
  const tour = page.getByRole("dialog");
  if (await tour.isVisible().catch(() => false)) {
    await page.getByRole("button", { name: "بستن راهنمای شروع" }).click();
    await expect(tour).toBeHidden();
  }

  await page.goto("/team");
}

/**
 * ورود با ایمیل/رمز از طریق /login.
 * تا وقتی از /login خارج نشده‌ایم برنمی‌گردد: وگرنه یک `goto` بلافاصله بعدی با
 * ست‌شدن کوکی نشست مسابقه می‌دهد و صفحهٔ محافظت‌شده دوباره به /login برمی‌گردد.
 */
export async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("ایمیل").fill(email);
  await page.getByLabel("رمز عبور").fill(password);
  await page.getByRole("button", { name: "ورود" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

/** فاز بازی را از طریق پنل برگزارکننده (/admin) تغییر می‌دهد؛ فرض بر این است که صفحه از قبل به‌عنوان ادمین لاگین است. */
export async function setPhaseViaAdmin(page: Page, phaseLabel: string) {
  await page.goto("/admin");
  // exact: true لازم است — کارت زمان‌بندی چند فیلد دیگر هم دارد که برچسبشان
  // شامل «فاز» است («پیشروی خودکار فاز»، «مدت فاز ... (ساعت)») و بدون آن
  // strict mode با هفت تطبیق می‌شکند.
  const select = page.getByLabel("فاز", { exact: true });
  await select.selectOption({ label: phaseLabel });
  await page.getByRole("button", { name: "اعمال" }).click();
  // تا وقتی سرور فاز را ذخیره نکرده برنگرد؛ کانتکست‌های دیگر بلافاصله بعد از
  // این تابع به صفحه‌های قفل‌شده با فاز می‌روند.
  await expect(select).toHaveValue(/.+/);
  await expect(page.getByRole("button", { name: "در حال اعمال…" })).toBeHidden();
}
