import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    environment: "node",
    // هر فایل تست در فرایند فرزند جدا اجرا می‌شود: پایگاه‌دادهٔ موقت هر فایل
    // (process.env.DATABASE_URL) با فایل‌های دیگر تداخل نمی‌کند.
    pool: "forks",
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
