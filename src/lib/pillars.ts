// پیلارهای گروه پگاه که در میدان بنیان‌گذاران شرکت می‌کنند.
// لوگوها در public/brand/pillars/ هستند (بریده و کوچک‌شده؛ w/h ابعاد واقعی فایل است).
export const GROUP_NAME = "گروه پگاه";

export type Pillar = { slug: string; name: string; w: number; h: number };

export const PILLARS: Pillar[] = [
  { slug: "cafebazaar", name: "کافه‌بازار", w: 323, h: 144 },
  { slug: "tapsell", name: "تپسل", w: 360, h: 85 },
  { slug: "bazaar-studio", name: "بازار استودیو", w: 316, h: 144 },
  { slug: "metrix", name: "متریکس", w: 360, h: 75 },
  { slug: "iranads", name: "ایران‌ادز", w: 251, h: 144 },
  { slug: "mediahouse", name: "مدیاهاوس", w: 333, h: 144 },
  { slug: "college-tapsell", name: "کالج تپسل", w: 360, h: 135 },
  { slug: "beeptunes", name: "بیپ‌تونز", w: 176, h: 144 },
  { slug: "salamcinema", name: "سلام سینما", w: 224, h: 144 },
  { slug: "bebin", name: "ببین", w: 121, h: 144 },
  { slug: "footbali", name: "فوتبالی", w: 135, h: 144 },
  { slug: "nazdika", name: "نزدیکا", w: 101, h: 144 },
  { slug: "jabeh", name: "جعبه", w: 360, h: 140 },
  { slug: "funtory", name: "فانتوری", w: 360, h: 129 },
  { slug: "gapify", name: "گپیفای", w: 129, h: 144 },
  { slug: "athena", name: "آتنا", w: 211, h: 144 },
  { slug: "metis", name: "متیس", w: 105, h: 144 },
  { slug: "publica", name: "پابلیکا", w: 360, h: 93 },
  { slug: "elitland", name: "الیت‌لند", w: 360, h: 109 },
  { slug: "pdks", name: "PDKS", w: 144, h: 144 },
];

export const pillarLogo = (p: Pillar) => `/brand/pillars/${p.slug}.png`;
