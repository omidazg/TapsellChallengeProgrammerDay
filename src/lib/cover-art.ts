/**
 * جلد پیش‌فرضِ ساخته‌شده روی خود سایت (SVG قطعی بر اساس seed).
 *
 * picsum.photos کاربران ایران را geoblock می‌کند و جلدهای پیش‌فرض/تصادفی برای
 * بیشتر شرکت‌کننده‌ها خالی می‌ماند؛ این جلدها از src/app/covers/[name]/route.ts
 * سرو می‌شوند و به هیچ سرویس بیرونی وابسته نیستند. تابع‌ها خالص‌اند (کلاینت و سرور).
 */

const SEED_RE = /^[a-z0-9_-]{1,64}$/;

/** seed دلخواه (مثلاً slug تیم یا شناسهٔ محصول) را به seed امن نشانی تبدیل می‌کند */
export function coverSeed(raw: string): string {
  const s = raw
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return s || `c${fnv1a(raw).toString(36)}`;
}

export function generatedCoverUrl(seed: string): string {
  return `/covers/${coverSeed(seed)}.svg`;
}

export function randomCoverUrl(): string {
  return generatedCoverUrl(Math.random().toString(36).slice(2, 10));
}

/** آیا این نشانی جلد ساخته‌شدهٔ محلی است؟ */
export function isGeneratedCoverUrl(url: string): boolean {
  const m = /^\/covers\/([^/]+)\.svg$/.exec(url);
  return !!m && SEED_RE.test(m[1]);
}

/** seed معتبرِ نام فایل (`<seed>.svg`) یا null */
export function seedFromCoverName(name: string): string | null {
  const m = /^(.+)\.svg$/.exec(name);
  return m && SEED_RE.test(m[1]) ? m[1] : null;
}

function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** مولد شبه‌تصادفی کوچک (mulberry32) تا هر seed همیشه همان تصویر را بدهد */
function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PALETTES: [string, string][] = [
  ["#0b1f3a", "#0ea5e9"],
  ["#1e1b4b", "#e11d48"],
  ["#052e2b", "#14b8a6"],
  ["#2e1065", "#a855f7"],
  ["#3b0764", "#f59e0b"],
  ["#0c4a6e", "#22d3ee"],
  ["#450a0a", "#fb7185"],
  ["#1f2937", "#84cc16"],
];

export function coverSvg(seed: string): string {
  const r = rng(fnv1a(seed));
  const [from, to] = PALETTES[Math.floor(r() * PALETTES.length)];
  const angle = Math.floor(r() * 360);
  const shapes: string[] = [];
  for (let i = 0; i < 5; i++) {
    const cx = Math.round(r() * 800);
    const cy = Math.round(r() * 500);
    const rad = Math.round(60 + r() * 220);
    const op = (0.06 + r() * 0.14).toFixed(2);
    shapes.push(
      i % 2 === 0
        ? `<circle cx="${cx}" cy="${cy}" r="${rad}" fill="#fff" fill-opacity="${op}"/>`
        : `<circle cx="${cx}" cy="${cy}" r="${rad}" fill="none" stroke="#fff" stroke-opacity="${op}" stroke-width="${Math.round(6 + r() * 18)}"/>`
    );
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500" viewBox="0 0 800 500">` +
    `<defs><linearGradient id="g" gradientTransform="rotate(${angle} .5 .5)">` +
    `<stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs>` +
    `<rect width="800" height="500" fill="url(#g)"/>${shapes.join("")}</svg>`
  );
}
