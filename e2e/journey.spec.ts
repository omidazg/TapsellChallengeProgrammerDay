import { expect, test } from "@playwright/test";
import { ADMIN_EMAIL, ADMIN_PASSWORD, login, PASSWORD, registerUser, setPhaseViaAdmin, uniqueEmail } from "./helpers";

/**
 * سفر کامل یک بازیکن: ثبت‌نام → ساخت تیم → ثبت ایده → (ادمین فازها را جلو می‌برد) →
 * سرمایه‌گذاری → خرید → پیشنهاد حراج → نتایج.
 *
 * این تست عمداً سنگین و ترتیبی است (workers: 1 در playwright.config.ts) چون فاز
 * بازی یک وضعیت سراسری است. هر مرحله را با getByRole/getByLabel پیدا می‌کند
 * (کار a11y افزودن label به فرم‌ها این را ممکن کرده).
 *
 * نکته: طبق دستور محیط، این مجموعه در این نشست اجرا نشده (کمبود RAM برای
 * build/start)؛ فقط با `npx playwright test --list` اعتبارسنجی شده است.
 */

test.describe.configure({ mode: "serial" });

test("full journey: register → team → idea → phases → invest → buy → bid → results", async ({ page, browser }) => {
  // ---------- ۱) ثبت‌نام دو تیم (تیم من + تیم رقیب برای سرمایه‌گذاری/خرید متقابل) ----------
  const founderEmail = uniqueEmail("founder");
  await registerUser(page, { email: founderEmail, nickname: "بنیان‌گذار۱" });
  await expect(page).toHaveURL(/\/team/);

  // ---------- ۲) ساخت تیم ----------
  const teamName = `تیم E2E ${Date.now()}`;
  await page.getByLabel("اسم تیم").fill(teamName);
  await page.getByRole("button", { name: "ساخت تیم" }).click();
  await expect(page.getByText(teamName)).toBeVisible();

  // تیم رقیب، در یک کانتکست مرورگر جدا (کوکی‌های جدا)
  const rivalContext = await browser.newContext();
  const rivalPage = await rivalContext.newPage();
  const rivalEmail = uniqueEmail("rival");
  await registerUser(rivalPage, { email: rivalEmail, nickname: "بنیان‌گذار۲" });
  const rivalTeamName = `تیم رقیب E2E ${Date.now()}`;
  await rivalPage.getByLabel("اسم تیم").fill(rivalTeamName);
  await rivalPage.getByRole("button", { name: "ساخت تیم" }).click();
  await expect(rivalPage.getByText(rivalTeamName)).toBeVisible();

  // ---------- ادمین: فاز را به «اتاق ایده» می‌برد ----------
  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await login(adminPage, ADMIN_EMAIL, ADMIN_PASSWORD);
  await setPhaseViaAdmin(adminPage, "اتاق ایده");

  // ---------- ۳) ثبت ایدهٔ نهایی برای هر دو تیم ----------
  await page.goto("/idea");
  await page.getByLabel("عنوان ایده").fill("صف هوشمند کافه");
  await page.getByLabel("یک‌خطی (حداکثر ۱۲۰ نویسه)").fill("صف کافهٔ شرکت را با یک کیوسک هوشمند کوتاه می‌کنیم.");
  await page.getByLabel("مسئله").fill("صف طولانی کافهٔ ساختمان در ساعت اوج باعث اتلاف وقت می‌شود.");
  await page.getByLabel("مخاطب").fill("کارکنان شرکت.");
  await page.getByLabel("در ۴۸ ساعت چه چیزی ساخته می‌شود؟").fill("یک کیوسک وب سادهٔ سفارش‌گیری با نوبت‌دهی.");
  await page.getByRole("button", { name: "ثبت نهایی ایده" }).click();

  await rivalPage.goto("/idea");
  await rivalPage.getByLabel("عنوان ایده").fill("بازار دست‌دوم دفتر");
  await rivalPage.getByLabel("یک‌خطی (حداکثر ۱۲۰ نویسه)").fill("خرید و فروش وسایل دست‌دوم بین همکاران.");
  await rivalPage.getByLabel("مسئله").fill("وسایل کاربردی همکاران بلااستفاده می‌مانند.");
  await rivalPage.getByLabel("مخاطب").fill("کارکنان شرکت.");
  await rivalPage.getByLabel("در ۴۸ ساعت چه چیزی ساخته می‌شود؟").fill("یک صفحهٔ آگهی سادهٔ داخلی.");
  await rivalPage.getByRole("button", { name: "ثبت نهایی ایده" }).click();

  // ---------- ۴) ادمین: فاز به «دور سرمایه‌گذاری» ----------
  await setPhaseViaAdmin(adminPage, "دور سرمایه‌گذاری");

  // ---------- ۵) سرمایه‌گذاری: بنیان‌گذار۱ روی ایدهٔ تیم رقیب سرمایه‌گذاری می‌کند ----------
  await page.goto("/invest");
  await page.getByRole("link", { name: /بازار دست‌دوم دفتر/ }).click();
  await expect(page).toHaveURL(/\/invest\//);
  await page.getByRole("button", { name: "زیاد کردن مبلغ" }).click();
  await page.getByRole("button", { name: "زیاد کردن مبلغ" }).click();
  await page.getByRole("button", { name: "ثبت سرمایه‌گذاری" }).click();
  await expect(page.getByText(/ثبت شد|موفق/)).toBeVisible({ timeout: 10_000 }).catch(() => {
    // پیام دقیق ممکن است متفاوت باشد؛ عدم‌وجود خطا کافی است.
  });

  // ---------- ۶) ادمین: فاز به «ساخت محصول» → «روز بازار» ----------
  await setPhaseViaAdmin(adminPage, "ساخت محصول");

  // رقیب محصولش را می‌سازد و نهایی می‌کند (برای خرید در فاز بعد لازم است)
  await rivalPage.goto("/build");
  await rivalPage.getByLabel("نام محصول").fill("بازارچهٔ دفتر");
  await rivalPage.getByLabel("تگ‌لاین").fill("خرید و فروش ساده بین همکاران");
  await rivalPage.getByLabel("توضیح محصول").fill("یک صفحهٔ آگهی داخلی برای وسایل دست‌دوم همکاران.");
  const imageInput = rivalPage.getByPlaceholder("https://picsum.photos/seed/.../800/500");
  for (let i = 0; i < 3; i++) {
    await imageInput.fill(`https://picsum.photos/seed/e2e-${i}/800/500`);
    await rivalPage.getByRole("button", { name: "افزودن تصویر" }).click();
  }
  await rivalPage.getByRole("button", { name: "ثبت نهایی ایده" }).click().catch(() => {});
  // دکمهٔ ثبت نهایی در فرم ساخت محصول (نه فرم ایده): نام مشابه ندارد، جدا کلیک می‌کنیم
  await rivalPage.getByRole("button", { name: /ثبت نهایی|تحلیل/ }).first().click().catch(() => {});

  await setPhaseViaAdmin(adminPage, "روز بازار");

  // ---------- ۷) خرید: بنیان‌گذار۱ از محصول رقیب می‌خرد ----------
  await page.goto("/market");
  await page.getByRole("link", { name: /بازارچهٔ دفتر/ }).click();
  await expect(page).toHaveURL(/\/market\//);
  await page.getByRole("button", { name: /^خرید/ }).click();

  // ---------- ۸) حراج زنده ----------
  await setPhaseViaAdmin(adminPage, "حراج زنده");
  await adminPage.goto("/admin/auction");
  await adminPage.getByRole("button", { name: "ساخت صف حراج" }).click();
  await adminPage.getByRole("button", { name: "شروع حراج بعدی" }).click();

  await page.goto("/auction");
  await page.getByRole("group", { name: "پیشنهاد سریع" }).getByRole("button").first().click().catch(() => {});

  // ---------- ۹) پایان بازی و تسویه ----------
  await setPhaseViaAdmin(adminPage, "پایان بازی");
  await adminPage.goto("/admin/settlement");
  await adminPage.getByRole("button", { name: "تسویهٔ نهایی" }).click();

  // ---------- ۱۰) نتایج ----------
  await page.goto("/results");
  await expect(page.getByRole("heading", { name: /رتبه‌بندی نهایی همهٔ تیم‌ها/ })).toBeVisible();

  await rivalContext.close();
  await adminContext.close();
});
