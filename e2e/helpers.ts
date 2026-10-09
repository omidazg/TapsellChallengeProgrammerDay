import { expect, type Browser, type Page } from "@playwright/test";
import type { Phase } from "../src/lib/phases";

/** ایمیل و رمز یکتا برای هر اجرا (جلوگیری از برخورد در سرور در حال اجرا) */
export function uniqueEmail(tag: string) {
  return `e2e-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@tapsell.ir`;
}

export const PASSWORD = "e2e-secret-123";

/** کاربر مدیر seed‌شده در prisma/seed.ts (فقط برای محیط لوکال/تست) */
export const ADMIN_EMAIL = "admin@tapsell.ir";
export const ADMIN_PASSWORD = "admin1234";

const dialogPages = new WeakSet<Page>();

/**
 * Playwright پنجره‌های confirm را به‌طور پیش‌فرض رد (dismiss) می‌کند؛ پس هر فرمی
 * که پیش از ارسال `confirm()` می‌پرسد (شرکت فردی، فرستادن به حراج، تغییر فاز،
 * شروع حراج، تسویه) بی‌صدا ارسال نمی‌شد. این کمک‌تابع همهٔ دیالوگ‌های این صفحه را
 * می‌پذیرد و برای هر صفحه فقط یک‌بار شنونده ثبت می‌کند (پذیرفتن دوباره خطا می‌دهد).
 */
export function acceptDialogs(page: Page) {
  if (dialogPages.has(page)) return;
  dialogPages.add(page);
  page.on("dialog", (dialog) => {
    void dialog.accept().catch(() => {});
  });
}

/**
 * ثبت‌نام یک کاربر تازه از طریق ویزارد ۴ مرحله‌ای /register:
 * حساب کاربری → مهارت → «خودت را کد بزن» → پیش‌نمایش.
 * مهارت پیش‌فرض «سازنده» است و فقط برچسب معرفی است، اثری در بازی ندارد.
 *
 * ثبت‌نام موفق به `/?welcome=1` می‌رود و راهنمای شروع (OnboardingTour) را
 * به‌صورت خودکار باز می‌کند. آن مودال focus-trap و بک‌دراپ دارد، پس اگر بسته
 * نشود هر کلیک و Tab بعدیِ تست را می‌بلعد. این کمک‌تابع مودال را می‌بندد و
 * سپس به /team می‌رود تا قرارداد قبلی («بعد از ثبت‌نام روی /team هستیم») حفظ شود.
 */
export async function registerUser(
  page: Page,
  opts: { email: string; nickname: string; skillLabel?: string; department?: string } = { email: "", nickname: "" }
) {
  await page.goto("/register");

  // مرحله ۱: حساب کاربری (برچسب‌ها با htmlFor به id فیلدها وصل‌اند)
  await page.getByLabel("ایمیل").fill(opts.email);
  await page.getByLabel("رمز عبور").fill(PASSWORD);
  await page.getByLabel("نام مستعار").fill(opts.nickname);
  if (opts.department) await page.getByLabel("دپارتمان").selectOption({ label: opts.department });
  else await page.getByLabel("دپارتمان").selectOption({ index: 1 });
  await page.getByRole("button", { name: "مرحلهٔ بعد" }).click();

  // مرحله ۲: مهارت (کارت‌های ROLES؛ aria-pressed دارند)
  await page.getByRole("button", { name: new RegExp(opts.skillLabel ?? "سازنده") }).click();
  await page.getByRole("button", { name: "مرحلهٔ بعد" }).click();

  // مرحله ۳: «خودت را کد بزن» — مقادیر پیش‌فرض کافی‌اند، فقط رد می‌شویم
  await page.getByRole("button", { name: "مرحلهٔ بعد" }).click();

  // مرحله ۴: پیش‌نمایش و ثبت نهایی
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

/**
 * فاز بازی را از طریق پنل برگزارکننده (/admin) تغییر می‌دهد؛ فرض بر این است که صفحه از قبل به‌عنوان ادمین لاگین است.
 * فازها: REGISTRATION → IDEATION → SEED_ROUND → BUILD → MARKET → CLOSED (فاز جدای «حراج زنده» دیگر نیست؛
 * حراج داخل «روز بازار» برگزار می‌شود). گزینه با `value` (کلید فاز) انتخاب می‌شود، نه برچسب فارسی.
 */
export async function setPhaseViaAdmin(page: Page, phase: Phase) {
  // فرم فاز پیش از ارسال confirm می‌پرسد
  acceptDialogs(page);
  await page.goto("/admin");
  // exact: true لازم است — کارت زمان‌بندی چند فیلد دیگر هم دارد که برچسبشان
  // شامل «فاز» است («پیشروی خودکار فاز»، «مدت فاز ... (ساعت)») و بدون آن
  // strict mode با چند تطبیق می‌شکند.
  const select = page.getByLabel("فاز", { exact: true });
  await select.selectOption(phase);
  // زمان پایان را خالی می‌گذاریم: وگرنه مقدار فاز قبلی در فرم می‌ماند و ممکن است
  // پیشروی خودکار فاز را راه بیندازد یا صف حراج را در «دقایق پایانی روز بازار» ببندد.
  await page.locator("#endsAt").fill("");
  await page.getByRole("button", { name: "اعمال" }).click();
  // تا وقتی سرور فاز را ذخیره نکرده برنگرد؛ کانتکست‌های دیگر بلافاصله بعد از
  // این تابع به صفحه‌های قفل‌شده با فاز می‌روند. (ورود به CLOSED تسویه را هم اجرا می‌کند و کندتر است.)
  await expect(page.getByRole("status").filter({ hasText: "فاز به‌روزرسانی شد" })).toBeVisible({ timeout: 30_000 });
  await expect(select).toHaveValue(phase);
}

/**
 * لیست سفید به‌طور پیش‌فرض روشن است؛ ایمیل‌های تازهٔ تست را پیش از ثبت‌نام،
 * از مسیر واقعی پنل (/admin/whitelist → افزودن گروهی) و در کانتکستی جدا مجاز می‌کند.
 */
export async function whitelistEmails(browser: Browser, emails: string[]) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await page.goto("/admin/whitelist");
  await page.getByLabel("فهرست ایمیل‌ها").fill(emails.join("\n"));
  await page.getByRole("button", { name: "افزودن همه" }).click();
  await expect(page.getByText(/ایمیل اضافه شد/)).toBeVisible();
  await ctx.close();
}
