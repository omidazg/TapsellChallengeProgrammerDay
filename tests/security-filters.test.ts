/**
 * تست جدولی فیلترهای امنیتی: مسیر بازگشت پس از ورود، نشانی push، گواهی شمارهٔ تأییدشده،
 * قاعدهٔ «هر ردیف لیست سفید فقط یک حساب»، و تصاحب حساب با ایمیلِ لیست سفیدی که شماره دارد.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { safeNext } from "../src/app/login/next";
import { createTempDb, isTempDatabaseUrl } from "../scripts/lib/temp-db";

// push و otp خودشان lib/db را import می‌کنند؛ پس پایگاه موقت باید پیش از آن‌ها ساخته شود (وگرنه dev.db)
const db = createTempDb("security-filters");
if (!isTempDatabaseUrl(process.env.DATABASE_URL)) throw new Error("DATABASE_URL موقت نیست");
const { prisma } = await import("../src/lib/db");
const { isAllowedPushEndpoint } = await import("../src/lib/push");
const { signPhoneProof, checkPhoneProof } = await import("../src/lib/otp");

afterAll(async () => {
  await prisma.$disconnect();
  db.cleanup();
});

// اکشن ثبت‌نام بیرون از Next اجرا می‌شود: کوکی/هدر و redirect شبیه‌سازی می‌شوند
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "10.0.0.1" }),
  cookies: async () => ({
    get: (k: string) => (jar.has(k) ? { value: jar.get(k) } : undefined),
    set: (k: string, v: string) => void jar.set(k, v),
    delete: (k: string) => void jar.delete(k),
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { to });
  },
}));

describe("safeNext", () => {
  it.each([
    ["/team", "/team"],
    ["/market/abc?x=1#y", "/market/abc?x=1#y"],
    ["//evil.com", null],
    ["/\\evil.com", null],
    ["/\t/evil.com", null],
    ["/\n/evil.com", null],
    ["https://evil.com", null],
    ["evil.com", null],
    ["", null],
    ["/" + "a".repeat(600), null],
    [42, null],
    [null, null],
  ])("%j → %j", (input, out) => {
    expect(safeNext(input)).toBe(out);
  });
});

describe("isAllowedPushEndpoint", () => {
  it.each([
    ["https://fcm.googleapis.com/fcm/send/abc", true],
    ["https://updates.push.services.mozilla.com/wpush/v2/x", true],
    ["https://web.push.apple.com/abc", true],
    ["https://wns2-par02p.notify.windows.com/w/?token=x", true],
    ["https://fcm.googleapis.com:443/x", true],
    ["http://fcm.googleapis.com/x", false],
    ["https://fcm.googleapis.com:8443/x", false],
    ["https://user:pw@fcm.googleapis.com/x", false],
    ["https://evilfcm.googleapis.com.evil.com/x", false],
    ["https://fcm.googleapis.com.evil.com/x", false],
    ["https://notfcm.googleapis.com/x", false],
    ["https://127.0.0.1/x", false],
    ["https://localhost/x", false],
    ["not a url", false],
  ])("%s → %s", (endpoint, ok) => {
    expect(isAllowedPushEndpoint(endpoint)).toBe(ok);
  });
});

describe("signPhoneProof / checkPhoneProof", () => {
  const phone = "09120000001";
  const proof = signPhoneProof(phone, "REGISTER");
  const [exp, sig] = proof.split(".");
  it.each([
    ["گواهی درست", proof, phone, "REGISTER", true],
    ["شمارهٔ دیگر", proof, "09120000002", "REGISTER", false],
    ["منظور دیگر", proof, phone, "LOGIN", false],
    ["امضای دست‌کاری‌شده", `${exp}.${sig.slice(0, -1)}${sig.endsWith("0") ? "1" : "0"}`, phone, "REGISTER", false],
    ["انقضای دست‌کاری‌شده", `${Number(exp) + 3600}.${sig}`, phone, "REGISTER", false],
    ["منقضی", `${Math.floor(Date.now() / 1000) - 1}.${sig}`, phone, "REGISTER", false],
    ["امضای کوتاه", `${exp}.ab`, phone, "REGISTER", false],
    ["بدون امضا", `${exp}`, phone, "REGISTER", false],
    ["خالی", "", phone, "REGISTER", false],
    ["null", null, phone, "REGISTER", false],
  ] as const)("%s", (_label, token, p, purpose, ok) => {
    expect(checkPhoneProof(token, p, purpose)).toBe(ok);
  });
});

describe("لیست سفید و ثبت‌نام (پایگاه‌دادهٔ موقت)", () => {
  let wl: typeof import("../src/lib/whitelist");
  let reg: typeof import("../src/app/register/actions");

  beforeAll(async () => {
    wl = await import("../src/lib/whitelist");
    reg = await import("../src/app/register/actions");
    const { setModuleStatus } = await import("../src/lib/module-state");
    await setModuleStatus("registration", "open");
  });

  beforeEach(async () => {
    jar.clear();
    const { resetRateLimits } = await import("../src/lib/rate-limit");
    resetRateLimits();
  });

  async function makeUser(email: string, phone: string | null = null) {
    await prisma.user.create({ data: { email, phone, passwordHash: "x", nickname: "تست", role: "BUILDER", power: "", avatarSeed: email } });
  }

  it("هر ردیف فقط یک حساب: ردیفی که ایمیل یا شماره‌اش حساب دارد مصرف‌شده است", async () => {
    await prisma.allowedEmail.createMany({
      data: [
        { email: "free@x.ir", phone: "09130000001" },
        { email: "used-email@x.ir", phone: "09130000002" },
        { email: "used-phone@x.ir", phone: "09130000003" },
        { email: "nophone@x.ir" },
      ],
    });
    await makeUser("used-email@x.ir");
    await makeUser("someone-else@x.ir", "09130000003");

    const cases: [string, string | null, boolean][] = [
      ["free@x.ir", null, true],
      ["FREE@x.ir ", null, true],
      ["other@x.ir", "09130000001", true], // شمارهٔ ردیف آزاد
      ["used-email@x.ir", null, false],
      ["other@x.ir", "09130000002", false], // شمارهٔ ردیفی که ایمیلش حساب ساخته
      ["used-phone@x.ir", null, false],
      ["nophone@x.ir", null, true],
      ["stranger@x.ir", null, false],
    ];
    for (const [email, phone, ok] of cases) {
      expect(await wl.isWhitelisted(email, phone), `${email} ${phone}`).toBe(ok);
      expect(await wl.canRegister(email, phone), `${email} ${phone}`).toBe(ok); // لیست سفید پیش‌فرض روشن است
    }
  });

  const form = (email: string) => ({
    email,
    password: "password123",
    nickname: "تازه",
    department: "بک‌اند" as const,
    role: "BUILDER" as const,
    coffee: 1,
    bugs: 1,
    sleep: 7,
    confidence: 50,
  });

  it("ایمیل لیست سفید با شماره: بدون تأیید همان شماره حساب ساخته نمی‌شود و شماره خودکار وصل نمی‌شود", async () => {
    await prisma.allowedEmail.create({ data: { email: "victim@x.ir", phone: "09140000001" } });
    await prisma.allowedEmail.create({ data: { email: "attacker@x.ir", phone: "09140000002" } });

    // بدون شماره
    const noPhone = await reg.registerAction(form("victim@x.ir"));
    expect(noPhone?.fieldErrors?.phone).toBeTruthy();
    expect(await reg.checkRegisterEmailAction("victim@x.ir")).toMatchObject({ fieldErrors: { phone: expect.any(String) } });

    // با شمارهٔ تأییدشدهٔ دیگری که خودش در لیست سفید است
    const other = "09140000002";
    const withOther = await reg.registerAction({ ...form("victim@x.ir"), phone: other, phoneProof: signPhoneProof(other, "REGISTER") });
    expect(withOther?.fieldErrors?.phone).toBeTruthy();
    expect(await prisma.user.count({ where: { email: "victim@x.ir" } })).toBe(0);

    // با گواهی جعلی برای همان شماره
    const forged = await reg.registerAction({ ...form("victim@x.ir"), phone: "09140000001", phoneProof: "9999999999.00" });
    expect(forged?.fieldErrors?.phone).toBeTruthy();

    // صاحب واقعی: همان شماره با گواهی معتبر
    const own = "09140000001";
    expect(await reg.checkRegisterEmailAction("victim@x.ir", own, signPhoneProof(own, "REGISTER"))).toEqual({ ok: true });
    await expect(reg.registerAction({ ...form("victim@x.ir"), phone: own, phoneProof: signPhoneProof(own, "REGISTER") })).rejects.toMatchObject({
      to: "/?welcome=1",
    });
    expect(await prisma.user.findUnique({ where: { email: "victim@x.ir" }, select: { phone: true } })).toEqual({ phone: own });
  });

  it("ردیف بدون شماره همچنان با ایمیل تنها ثبت‌نام می‌کند و شماره‌ای وصل نمی‌شود", async () => {
    await prisma.allowedEmail.create({ data: { email: "plain@x.ir" } });
    await expect(reg.registerAction(form("plain@x.ir"))).rejects.toMatchObject({ to: "/?welcome=1" });
    expect(await prisma.user.findUnique({ where: { email: "plain@x.ir" }, select: { phone: true } })).toEqual({ phone: null });
  });

  it("کد ثبت‌نام وقتی ثبت‌نام بسته است فرستاده نمی‌شود", async () => {
    const { setModuleStatus } = await import("../src/lib/module-state");
    await setModuleStatus("registration", "closed");
    try {
      expect(await reg.requestRegisterOtpAction("09150000001")).toEqual({ error: "ثبت‌نام بسته شده است." });
      expect(await prisma.otpCode.count({ where: { phone: "09150000001" } })).toBe(0);
    } finally {
      await setModuleStatus("registration", "open");
    }
  });
});
