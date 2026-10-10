import { expect, test } from "@playwright/test";
import { ADMIN_EMAIL, ADMIN_PASSWORD, acceptDialogs, login, registerUser, setPhaseViaAdmin, uniqueEmail, whitelistEmails } from "./helpers";

/**
 * سفر کامل یک بازیکن در بازی ساده‌شدهٔ «همه‌چیز با سکه»:
 * ثبت‌نام (فقط مهارت) → ساخت تیم / شرکت فردی → ثبت ایده → (ادمین فازها را جلو می‌برد) →
 * حمایت از ایدهٔ دیگران → ساخت محصول → روز بازار: خرید به قیمت کامل + فرستادن محصول به صف
 * حراج و پیشنهاد در حراج زنده → نتایج.
 *
 * فازها: ثبت‌نام و تیم → اتاق ایده → دور حمایت → ساخت محصول → روز بازار → پایان بازی.
 * (فاز جدای «حراج زنده» دیگر نیست؛ حراج داخل «روز بازار» است.)
 *
 * این تست عمداً سنگین و ترتیبی است (workers: 1 در playwright.config.ts) چون فاز
 * بازی یک وضعیت سراسری است. هر مرحله را با getByRole/getByLabel یا href/id فیلدها
 * پیدا می‌کند (کار a11y افزودن label به فرم‌ها این را ممکن کرده).
 */

test.describe.configure({ mode: "serial" });

test("full journey: register → team/solo → idea → support → build → buy → auction → results", async ({ page, browser }) => {
  // این یک تست نیست، یک سفر چندمرحله‌ای است: سه کانتکست مرورگر، دو ثبت‌نام کامل
  // از ویزارد چهارمرحله‌ای، و چند بار جابه‌جایی فاز از پنل ادمین. مهلت پیش‌فرض
  // ۳۰ ثانیه حتی به ساخت تیم‌ها هم نمی‌رسد.
  test.setTimeout(5 * 60 * 1000);

  // ---------- ۱) ثبت‌نام دو بازیکن (تیم من + رقیبِ فردی برای حمایت/خرید/حراج متقابل) ----------
  const founderEmail = uniqueEmail("founder");
  const rivalEmail = uniqueEmail("rival");
  const rivalNickname = "بنیان‌گذار۲";
  await whitelistEmails(browser, [founderEmail, rivalEmail]);
  // شرکت فردی، فرستادن به حراج و … پیش از ارسال confirm می‌پرسند
  acceptDialogs(page);
  await registerUser(page, { email: founderEmail, nickname: "بنیان‌گذار۱" });
  await expect(page).toHaveURL(/\/team/);

  // ---------- ۲) ساخت تیم ----------
  const teamName = `تیم E2E ${Date.now()}`;
  await page.getByLabel("اسم تیم").fill(teamName);
  await page.getByRole("button", { name: "ساخت تیم" }).click();
  // اسم تیم هم در h1 (سربرگ صفحه) و هم در h2 (کارت تیم) می‌آید؛ روی سربرگ اصلی تکیه می‌کنیم تا strict mode نشکند.
  await expect(page.getByRole("heading", { name: teamName, level: 1 })).toBeVisible();

  // رقیب «شرکت فردی» می‌شود (تیم یک‌نفرهٔ بسته به نام خودش)، در یک کانتکست مرورگر جدا (کوکی‌های جدا)
  const rivalContext = await browser.newContext();
  const rivalPage = await rivalContext.newPage();
  acceptDialogs(rivalPage);
  await registerUser(rivalPage, { email: rivalEmail, nickname: rivalNickname });
  await rivalPage.getByRole("button", { name: "فردی شرکت می‌کنم" }).click();
  // اسم تیم فردی همان نام مستعار است (اگر تکراری باشد پسوند عددی می‌گیرد؛ پس regex)
  await expect(rivalPage.getByRole("heading", { name: new RegExp(rivalNickname), level: 1 })).toBeVisible();

  // ---------- ادمین: فاز را به «اتاق ایده» می‌برد ----------
  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await login(adminPage, ADMIN_EMAIL, ADMIN_PASSWORD);
  await setPhaseViaAdmin(adminPage, "IDEATION");

  // ---------- ۳) ثبت ایدهٔ نهایی برای هر دو تیم ----------
  // فیلدها: title, oneLiner, problem, audience, buildPlan, coverUrl (هدف جذب/درصد سود دیگر نیست)
  await page.goto("/idea");
  await page.locator("#title").fill("صف هوشمند کافه");
  await page.locator("#oneLiner").fill("صف کافهٔ شرکت را با یک کیوسک هوشمند کوتاه می‌کنیم.");
  await page.locator("#problem").fill("صف طولانی کافهٔ ساختمان در ساعت اوج باعث اتلاف وقت می‌شود.");
  await page.locator("#audience").fill("کارکنان شرکت.");
  await page.locator("#buildPlan").fill("یک کیوسک وب سادهٔ سفارش‌گیری با نوبت‌دهی.");
  await page.getByRole("button", { name: "تصویر تصادفی" }).click();
  await page.getByRole("button", { name: "ثبت نهایی ایده" }).click();
  // پس از ثبت نهایی صفحه به نمای ایده می‌رود و فرم ویرایش دیگر نیست (تحلیل‌گر ممکن است کمی طول بکشد)
  await expect(page.locator("#title")).toBeHidden({ timeout: 30_000 });

  await rivalPage.goto("/idea");
  await rivalPage.locator("#title").fill("بازار دست‌دوم دفتر");
  await rivalPage.locator("#oneLiner").fill("خرید و فروش وسایل دست‌دوم بین همکاران.");
  await rivalPage.locator("#problem").fill("وسایل کاربردی همکاران بلااستفاده می‌مانند.");
  await rivalPage.locator("#audience").fill("کارکنان شرکت.");
  await rivalPage.locator("#buildPlan").fill("یک صفحهٔ آگهی سادهٔ داخلی.");
  await rivalPage.getByRole("button", { name: "ثبت نهایی ایده" }).click();
  await expect(rivalPage.locator("#title")).toBeHidden({ timeout: 30_000 });

  // ---------- ۴) ادمین: فاز به «دور حمایت» ----------
  await setPhaseViaAdmin(adminPage, "SEED_ROUND");

  // ---------- ۵) حمایت: بنیان‌گذار۱ با سکه‌هایش از ایدهٔ رقیب حمایت می‌کند ----------
  await page.goto("/invest");
  await page.locator('a[href^="/invest/"]').filter({ hasText: "بازار دست‌دوم دفتر" }).first().click();
  await expect(page).toHaveURL(/\/invest\//);
  await page.getByRole("button", { name: "زیاد کردن مبلغ" }).click();
  await page.getByRole("button", { name: "زیاد کردن مبلغ" }).click();
  await page.getByRole("button", { name: "ثبت حمایت" }).click();
  // کانفتی هم role=status با متن «حمایت ثبت شد 💚» دارد؛ نقطهٔ پایانی فقط با Alert فرم جور است.
  await expect(page.getByRole("status").filter({ hasText: "حمایت ثبت شد." })).toBeVisible({ timeout: 10_000 });

  // ---------- ۶) ادمین: فاز به «ساخت محصول» ----------
  await setPhaseViaAdmin(adminPage, "BUILD");

  // رقیب محصولش را می‌سازد و نهایی می‌کند (برای خرید و حراج در روز بازار لازم است)
  await rivalPage.goto("/build");
  await rivalPage.locator('[name="name"]').fill("بازارچهٔ دفتر");
  await rivalPage.locator('[name="tagline"]').fill("خرید و فروش ساده بین همکاران");
  await rivalPage.locator('textarea[name="description"]').fill("یک صفحهٔ آگهی داخلی برای وسایل دست‌دوم همکاران.");
  // چک‌لیست «ثبت نهایی» این سه را هم لازم دارد (lib/product-utils.ts → readyToSubmit)؛
  // بدون آن‌ها دکمه با «همهٔ موارد چک‌لیست را کامل کن» رد می‌شود و محصول در بازار ظاهر نمی‌شود.
  await rivalPage.locator('[name="demoUrl"]').fill("https://example.com/demo");
  await rivalPage.locator('[name="teaserUrl"]').fill("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  // نسخهٔ ویژه همان چیزی است که در روز بازار به صف حراج می‌رود
  await rivalPage.locator('[name="specialName"]').fill("نسخهٔ طلایی");
  // فرم ساخت حداقل سه تصویر می‌خواهد. دکمهٔ «تصویر تصادفی» دقیقاً برای همین است
  // و از پرکردن دستی ورودی URL ساده‌تر و پایدارتر است.
  const randomImage = rivalPage.getByRole("button", { name: "تصویر تصادفی" });
  for (let i = 0; i < 3; i++) await randomImage.click();

  await rivalPage.locator("#productFinalSubmit").click();
  // اینجا صریح assert می‌کنیم: اگر ثبت نهایی رد شود، محصول در فاز بعد وارد بازار
  // نمی‌شود و تست با خطای گمراه‌کنندهٔ «محصول در بازار پیدا نشد» می‌افتد.
  await expect(rivalPage.getByRole("status").filter({ hasText: /محصول ثبت نهایی شده/ })).toBeVisible({ timeout: 30_000 });

  // ---------- ۷) ادمین: فاز به «روز بازار» ----------
  await setPhaseViaAdmin(adminPage, "MARKET");

  // ---------- ۸) خرید: بنیان‌گذار۱ محصول رقیب را به قیمت کامل می‌خرد ----------
  await page.goto("/market");
  // aria-label لینک کارت با نام محصول شروع می‌شود؛ بنر بالای بازار هم ممکن است به همین محصول لینک بدهد
  await page.getByRole("link", { name: /بازارچهٔ دفتر/ }).first().click();
  await expect(page).toHaveURL(/\/market\//);
  await page.getByRole("button", { name: /^خرید/ }).click();
  // پس از خرید موفق دکمهٔ «قلب بده» ظاهر می‌شود
  await expect(page.getByRole("button", { name: /قلب بده/ })).toBeVisible({ timeout: 10_000 });

  // ---------- ۹) حراج زنده (داخل روز بازار) ----------
  // رقیب نسخهٔ ویژهٔ محصولش را از صفحهٔ محصول به صف حراج می‌فرستد
  await rivalPage.goto("/market");
  await rivalPage.getByRole("link", { name: /بازارچهٔ دفتر/ }).first().click();
  await expect(rivalPage).toHaveURL(/\/market\//);
  await rivalPage.getByRole("button", { name: /فرستادن به حراج/ }).click();
  // پس از فرستادن، صفحه تازه می‌شود و به‌جای دکمه وضعیت «در صف حراج» می‌آید.
  await expect(rivalPage.getByText(/به صف حراج رفت|در صف حراج ·/).first()).toBeVisible({ timeout: 10_000 });

  // حراج‌ها به ترتیب صف خودکار شروع می‌شوند؛ ادمین برای سرعت حراج بعدی را دستی شروع می‌کند
  // (اگر زمان‌بند زودتر شروعش کرده باشد، این فقط خطای «حراجی زنده است» می‌دهد که مهم نیست).
  await adminPage.goto("/admin/auction");
  await adminPage.getByRole("button", { name: "شروع حراج بعدی" }).click();

  await page.goto("/auction");
  const quickBids = page.getByRole("group", { name: "پیشنهاد سریع" });
  await expect(quickBids).toBeVisible({ timeout: 30_000 });
  await quickBids.getByRole("button").first().click();
  await expect(page.getByText(/پیشنهاد پیشتاز فعلی‌ات/)).toBeVisible({ timeout: 10_000 });

  // ---------- ۱۰) پایان بازی و تسویه ----------
  await setPhaseViaAdmin(adminPage, "CLOSED");
  await adminPage.goto("/admin/settlement");
  // ورود به فاز «پایان بازی» خودش تسویه را اجرا می‌کند (lib/phase-transition.ts)،
  // پس معمولاً دکمه همین‌جا غیرفعال است. اگر به هر دلیلی نشده بود، دستی می‌زنیم.
  const settleButton = adminPage.getByRole("button", { name: "تسویهٔ نهایی" });
  if (await settleButton.isEnabled()) {
    await settleButton.click();
    await expect(adminPage.getByText(/تسویه انجام شد|از قبل تسویه شده بود/)).toBeVisible({ timeout: 30_000 });
  }
  await expect(adminPage.getByText("تسویه شد", { exact: true })).toBeVisible();

  // ---------- ۱۱) نتایج ----------
  await page.goto("/results");
  await expect(page.getByRole("heading", { name: /رتبه‌بندی نهایی همهٔ تیم‌ها/ })).toBeVisible();

  await rivalContext.close();
  await adminContext.close();
});
