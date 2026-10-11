/**
 * تست واحد سخت‌سازی‌های ورود/نشست: مسیرهای محافظت‌شدهٔ proxy، پوشاندن کد در لاگ پیامک،
 * نگاشت خطای پیشنهاد حراج، و شمارش اتمیک تلاش‌های کد پیامکی (روی SQLite موقت).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isProtectedPath, loginUrlFor } from "../src/lib/session-cookie";
import { redactSmsText } from "../src/lib/sms";
import { bidErrorMessage, GENERIC_BID_ERROR } from "../src/app/auction/bid-errors";
import { createTempDb, type TempDb } from "../scripts/lib/temp-db";

describe("session-cookie: isProtectedPath", () => {
  it("صفحه‌های نیازمند ورود و زیرمسیرهایشان محافظت می‌شوند", () => {
    for (const p of ["/team", "/team/settings", "/market/some-team", "/admin", "/admin/users", "/results/abc/report", "/coins"]) {
      expect(isProtectedPath(p)).toBe(true);
    }
  });

  it("صفحه‌های عمومی و استثناها محافظت نمی‌شوند", () => {
    for (const p of ["/", "/login", "/register", "/join/abc", "/leaderboard", "/teams", "/coins/callback", "/coins/fake-gateway", "/survey/status"]) {
      expect(isProtectedPath(p)).toBe(false);
    }
  });

  it("نشانی ورود مسیر بازگشت را رمزگذاری می‌کند", () => {
    expect(loginUrlFor("/team?joined=1")).toBe("/login?next=%2Fteam%3Fjoined%3D1");
    expect(loginUrlFor(null)).toBe("/login");
  });
});

describe("sms: redactSmsText", () => {
  const text = "کد ورود میدان بنیان‌گذاران: 123456\nاین کد را به کسی ندهید.";
  it("در production فقط دو رقم آخر کد دیده می‌شود", () => {
    const out = redactSmsText(text, true);
    expect(out).not.toContain("123456");
    expect(out).toContain("****56");
  });
  it("در توسعه متن کامل می‌ماند", () => {
    expect(redactSmsText(text, false)).toBe(text);
  });
});

describe("auction: bidErrorMessage", () => {
  it("پیام‌های قواعد بازی همان‌طور برمی‌گردند", () => {
    expect(bidErrorMessage(new Error("سکهٔ قابل‌خرج کافی نداری"))).toBe("سکهٔ قابل‌خرج کافی نداری");
    expect(bidErrorMessage(new Error("پیشنهاد باید حداقل ۱٬۲۵۰ سکه باشد"))).toBe("پیشنهاد باید حداقل ۱٬۲۵۰ سکه باشد");
  });
  it("خطاهای داخلی پیام عمومی می‌گیرند", () => {
    class PrismaLikeError extends Error {}
    expect(bidErrorMessage(new Error("Invalid `prisma.bid.create()` invocation: SQLITE_BUSY"))).toBe(GENERIC_BID_ERROR);
    expect(bidErrorMessage(new PrismaLikeError("سکهٔ قابل‌خرج کافی نداری"))).toBe(GENERIC_BID_ERROR);
    expect(bidErrorMessage("boom")).toBe(GENERIC_BID_ERROR);
  });
});

describe("otp: verifyOtp", () => {
  let db: TempDb;
  let prisma: typeof import("../src/lib/db").prisma;
  let otp: typeof import("../src/lib/otp");

  beforeAll(async () => {
    db = createTempDb("otp-test");
    ({ prisma } = await import("../src/lib/db"));
    otp = await import("../src/lib/otp");
  });

  afterAll(async () => {
    await prisma.$disconnect();
    db.cleanup();
  });

  /** کد را بدون پیامک می‌سازد: requestOtp در توسعه devCode برمی‌گرداند */
  async function issue(phone: string) {
    const res = await otp.requestOtp(phone, "LOGIN");
    if (!res.ok || !res.devCode) throw new Error(`requestOtp failed: ${JSON.stringify(res)}`);
    return res.devCode;
  }

  it("کد درست یک‌بار پذیرفته می‌شود", async () => {
    const phone = "09990000001";
    const code = await issue(phone);
    expect((await otp.verifyOtp(phone, "LOGIN", code)).ok).toBe(true);
    expect((await otp.verifyOtp(phone, "LOGIN", code)).ok).toBe(false);
  });

  it("تلاش‌های هم‌زمانِ اشتباه از سقف پنج‌تایی عبور نمی‌کنند", async () => {
    const phone = "09990000002";
    const code = await issue(phone);
    const wrong = code === "000000" ? "111111" : "000000";
    await Promise.all(Array.from({ length: 20 }, () => otp.verifyOtp(phone, "LOGIN", wrong)));
    const row = await prisma.otpCode.findFirstOrThrow({ where: { phone }, orderBy: { createdAt: "desc" } });
    expect(row.attempts).toBe(5);
    // پس از پر شدن سقف، حتی کد درست هم پذیرفته نمی‌شود
    const res = await otp.verifyOtp(phone, "LOGIN", code);
    expect(res.ok).toBe(false);
  });
});
