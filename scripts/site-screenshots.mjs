/**
 * تصویرهای معرفی پروژه برای سایت شخصی (site-assets/<id>/) از روی دادهٔ نمایشی.
 *
 * پیش‌نیاز: دو نمونهٔ سرور روی دو پایگاه‌دادهٔ نمایشی (scripts/seed-demo.ts):
 *   - BASE      (پیش‌فرض http://localhost:3100) روی demo.db در مرحلهٔ «auction»
 *   - BASE_DONE (پیش‌فرض http://localhost:3101) روی demo-closed.db در مرحلهٔ «closed»
 * و DEMO_DB (مسیر فایل demo.db) تا فاز هر تصویر قبل از گرفتنش تنظیم شود.
 *
 *   DEMO_DB=/abs/demo.db node scripts/site-screenshots.mjs founders-arena
 */
import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ID = process.argv[2] || "founders-arena";
const BASE = process.env.BASE || "http://localhost:3100";
const BASE_DONE = process.env.BASE_DONE || "http://localhost:3101";
const DEMO_DB = process.env.DEMO_DB;
const USER = "kahkeshan3@demo.arena";
const PASSWORD = "Demo#1404";
const OUT = path.join("site-assets", ID);
const RAW = path.join(OUT, ".raw");

/** فاز بازی و زمان پایانش را مستقیم در demo.db تنظیم می‌کند (فقط دادهٔ نمایشی) */
function setPhase(phase, minutesLeft) {
  if (!DEMO_DB) throw new Error("DEMO_DB لازم است");
  const end = new Date(Date.now() + minutesLeft * 60000).toISOString();
  const sql = `
import sqlite3, sys
c = sqlite3.connect(sys.argv[1])
c.execute("update Setting set value=? where key='phase'", (sys.argv[2],))
c.execute("update Setting set value=? where key='phase_ends_at'", (sys.argv[3],))
# حراج زنده باید هنگام عکس‌گرفتن هنوز در جریان باشد
c.execute("update Auction set endsAt=? where status='LIVE'", (sys.argv[4],))
c.commit()`;
  // Prisma روی SQLite تاریخ را به شکل ISO با «+00:00» ذخیره می‌کند
  const liveEnd = new Date(Date.now() + (4 * 60 + 37) * 1000).toISOString().replace("Z", "+00:00");
  execFileSync("python3", ["-c", sql, DEMO_DB, phase, end, liveEnd]);
}

const HIDE_CSS = `
  *, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }
  html { scroll-behavior: auto !important; }
`;

async function prepare(page) {
  await page.addStyleTag({ content: HIDE_CSS });
  await page.evaluate(async () => {
    // اعلان بالای صفحه و کانفتی نتایج در تصویر نباشد
    document.querySelectorAll(".announcement-dismiss").forEach((b) => b.click());
    // یادآور بسته‌شدنی «سکهٔ خرج‌نشده» (دکمهٔ ×) هم بسته شود تا کارت‌ها دیده شوند
    document.querySelectorAll("button[aria-label^='بستن یادآوری']").forEach((b) => b.click());
    document.querySelectorAll("div.fixed.inset-0[aria-hidden]").forEach((el) => el.remove());
    // همهٔ تصاویر lazy را بارگذاری کن و منتظر فونت‌ها و تصاویر بمان
    document.querySelectorAll("img[loading=lazy]").forEach((img) => (img.loading = "eager"));
    await document.fonts.ready;
    await Promise.all(
      [...document.images].map((img) => (img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; })))
    );
    window.scrollTo(0, 0);
    document.activeElement?.blur?.();
  });
  await page.mouse.move(0, 0);
  await page.waitForTimeout(700);
}

async function login(ctx, base) {
  const page = await ctx.newPage();
  await page.goto(base + "/login");
  await page.getByLabel("ایمیل").fill(USER);
  await page.getByLabel(/رمز/).first().fill(PASSWORD);
  await page.locator("button[type=submit]").first().click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 15000 });
  return page;
}

async function ideaId(slug) {
  const out = execFileSync("python3", [
    "-c",
    "import sqlite3,sys;print(sqlite3.connect(sys.argv[1]).execute(\"select i.id from Idea i join Team t on t.id=i.teamId where t.slug=?\",(sys.argv[2],)).fetchone()[0])",
    DEMO_DB,
    slug,
  ]);
  return out.toString().trim();
}

const SHOTS = [
  { name: "01-dashboard", path: "/", phase: ["MARKET", 145] },
  { name: "02-invest-floor", path: "/invest", phase: ["SEED_ROUND", 95] },
  { name: "03-idea-analyst", path: `/invest/${await ideaId("simorgh")}`, phase: ["MARKET", 145] },
  { name: "04-market", path: "/market", phase: ["MARKET", 145] },
  { name: "05-live-auction", path: "/auction", phase: ["AUCTION", 53] },
  { name: "06-results", path: "/results", done: true },
  { name: "07-hall-display", path: "/hall", phase: ["AUCTION", 53] },
];
const MOBILE = [
  { name: "m01-dashboard", path: "/", phase: ["MARKET", 145] },
  { name: "m02-market", path: "/market", phase: ["MARKET", 145] },
  { name: "m03-live-auction", path: "/auction", phase: ["AUCTION", 53] },
];

mkdirSync(path.join(OUT, "screens"), { recursive: true });
mkdirSync(RAW, { recursive: true });

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctxOpts = { locale: "fa-IR", colorScheme: "light", reducedMotion: "reduce" };

async function run(list, viewport, deviceScaleFactor, extra = {}) {
  const pages = {};
  for (const s of list) {
    const base = s.done ? BASE_DONE : BASE;
    if (!pages[base]) {
      const ctx = await browser.newContext({ ...ctxOpts, viewport, deviceScaleFactor, ...extra });
      pages[base] = await login(ctx, base);
    }
    const page = pages[base];
    if (s.phase) {
      setPhase(...s.phase);
      // /api/phase دو ثانیه کش دارد؛ وگرنه اعلان «فاز بازی تغییر کرد» روی تصویر می‌آید
      await page.waitForTimeout(2500);
    }
    await page.goto(base + s.path, { waitUntil: "networkidle" });
    await prepare(page);
    if (s.path === "/auction") {
      // یک پیشنهاد معتبر تایپ شود تا دکمهٔ «ثبت پیشنهاد» فعال دیده شود (ارسال نمی‌شود)
      await page.locator("input[inputmode=numeric]").first().fill("32");
      await page.evaluate(() => document.activeElement?.blur?.());
      await page.mouse.move(0, 0);
      await page.waitForTimeout(300);
    }
    // در موبایل دکمهٔ شناور دستیار روی دکمه‌های اصلی می‌افتد
    if (viewport.width < 500) await page.addStyleTag({ content: "[aria-controls=ask-agent-panel]{display:none!important}" });
    await page.screenshot({ path: path.join(RAW, `${s.name}.png`) });
    console.log("shot", s.name);
  }
}

await run(SHOTS, { width: 1440, height: 900 }, 2);
// موبایل: عرض ۳۹۰ با ضریب 1600/390 تا خروجی بدون بزرگ‌نمایی به عرض ۱۶۰۰ برسد
await run(MOBILE, { width: 390, height: 844 }, 1600 / 390, { isMobile: true, hasTouch: true });
await browser.close();

// ---- WebP ----
const sizes = [];
for (const s of [...SHOTS, ...MOBILE]) {
  const out = path.join(OUT, "screens", `${s.name}.webp`);
  await sharp(path.join(RAW, `${s.name}.png`)).resize({ width: 1600 }).webp({ quality: 82 }).toFile(out);
  sizes.push([out, statSync(out).size]);
}

// ---- کاور 1600×1000: نمای سالن در قاب روی زمینهٔ #081016 ----
const W = 1600, H = 1000, PADX = 80, PADY = 50, R = 22;
const iw = W - 2 * PADX, ih = H - 2 * PADY; // 1440×900 = همان 16:10
const shot = await sharp(path.join(RAW, "07-hall-display.png")).resize(iw, ih).png().toBuffer();
const mask = Buffer.from(`<svg width="${iw}" height="${ih}"><rect width="${iw}" height="${ih}" rx="${R}" fill="#fff"/></svg>`);
const rounded = await sharp(shot).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
const frame = Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="glow" cx="50%" cy="0%" r="75%"><stop offset="0" stop-color="#0e7490" stop-opacity=".35"/><stop offset="1" stop-color="#081016" stop-opacity="0"/></radialGradient>
    <filter id="sh" x="-10%" y="-10%" width="120%" height="130%"><feDropShadow dx="0" dy="18" stdDeviation="22" flood-color="#000" flood-opacity=".55"/></filter>
  </defs>
  <rect width="${W}" height="${H}" fill="#081016"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect x="${PADX}" y="${PADY}" width="${iw}" height="${ih}" rx="${R}" fill="#081016" filter="url(#sh)"/>
</svg>`);
const border = Buffer.from(`<svg width="${W}" height="${H}"><rect x="${PADX + 0.5}" y="${PADY + 0.5}" width="${iw - 1}" height="${ih - 1}" rx="${R}" fill="none" stroke="#ffffff" stroke-opacity=".14"/></svg>`);
const cover = path.join(OUT, "cover.webp");
await sharp(frame).composite([{ input: rounded, left: PADX, top: PADY }, { input: border }]).webp({ quality: 82 }).toFile(cover);
sizes.push([cover, statSync(cover).size]);

writeFileSync(path.join(RAW, "sizes.json"), JSON.stringify(sizes, null, 2));
for (const [f, b] of sizes) console.log(`${(b / 1024).toFixed(0).padStart(4)} KB  ${f}`);
