import { defineConfig, devices } from "@playwright/test";
import os from "node:os";
import path from "node:path";

/**
 * پیکربندی Playwright — فقط Chromium، فقط برای مسیر e2e/.
 *
 * اگر E2E_BASE_URL تنظیم شده باشد (مثلاً به یک استیجینگ یا سروری که از قبل بالاست
 * اشاره می‌کند)، هیچ webServer‌ای اینجا اجرا نمی‌شود و تست‌ها مستقیم به آن آدرس
 * وصل می‌شوند. در غیر این صورت، خودمان اپ را روی پورت ۳۲۰۰ با یک پایگاه‌دادهٔ SQLite
 * موقت و تازه (migrate deploy + seed) build/start می‌کنیم.
 *
 * هشدار محیط توسعه: build کردن اپ به RAM قابل توجهی نیاز دارد؛ در محیط این ایجنت
 * (RAM بسیار کم) این پروسه عمداً اجرا نمی‌شود — فقط `npx playwright test --list`
 * برای اعتبارسنجی discovery/typecheck اجرا شده است.
 */

const PORT = 3200;
const E2E_BASE_URL = process.env.E2E_BASE_URL;
const baseURL = E2E_BASE_URL || `http://localhost:${PORT}`;

const tempDbFile = path.join(os.tmpdir(), `arena-e2e-${process.pid}-${Date.now()}.db`);
const tempDbUrl = `file:${tempDbFile.replace(/\\/g, "/")}`;

// حداقل ۳۲ نویسه، فقط برای اینکه اپ در محیط build/start بالا بیاید — یک مقدار واقعی نیست.
const DUMMY_SESSION_SECRET = "e2e-dummy-session-secret-not-for-prod-32chars+";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [["html", { open: "never" }], ["list"]] : "list",

  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // فقط وقتی E2E_BASE_URL ست نشده باشد، خودمان اپ را بالا می‌آوریم.
  webServer: E2E_BASE_URL
    ? undefined
    : {
        command: [
          "npx prisma migrate deploy",
          "npx tsx prisma/seed.ts",
          "npx next build",
          `npx next start -p ${PORT}`,
        ].join(" && "),
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 5 * 60 * 1000,
        env: {
          ...process.env,
          DATABASE_URL: tempDbUrl,
          PORT: String(PORT),
          SESSION_SECRET: DUMMY_SESSION_SECRET,
          NODE_ENV: "production",
        },
      },
});
