import { expect, test } from "@playwright/test";

/**
 * دود-تست‌های سطحی UI: صفحات عمومی بدون خطای کنسول بالا می‌آیند، صفحهٔ ۴۰۴،
 * لینک پرش (skip link) و دکمهٔ تعویض پوسته.
 */

test("home page loads with no console errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));

  await page.goto("/");
  await expect(page).toHaveTitle(/.+/);
  expect(errors, `console errors on /: ${errors.join("\n")}`).toEqual([]);
});

test("login page loads with no console errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));

  await page.goto("/login");
  await expect(page.getByLabel("ایمیل")).toBeVisible();
  expect(errors, `console errors on /login: ${errors.join("\n")}`).toEqual([]);
});

test("unknown route renders the 404 page", async ({ page }) => {
  const res = await page.goto("/this-route-does-not-exist-e2e");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: /این صفحه پیدا نشد/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "بازگشت به خانه" })).toBeVisible();
});

test("skip link jumps to main content", async ({ page }) => {
  await page.goto("/");
  const skipLink = page.getByRole("link", { name: "پرش به محتوای اصلی" });
  await expect(skipLink).toHaveAttribute("href", "#main");
  // در اکثر مرورگرها لینک پرش تا فوکوس/کلیک مخفی است؛ حضورش در DOM کافی‌ست.
  await expect(skipLink).toBeAttached();
});

test("dark mode toggle switches the page theme", async ({ page }) => {
  await page.goto("/");
  const toggle = page.getByRole("button", { name: /تغییر پوسته/ });
  await expect(toggle).toBeVisible();

  const before = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
  await toggle.click();
  const after = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
  expect(after).not.toBe(before);
});
