import { prisma } from "./db";

export const PHASES = [
  "REGISTRATION",
  "IDEATION",
  "SEED_ROUND",
  "BUILD",
  "MARKET",
  "AUCTION",
  "CLOSED",
] as const;
export type Phase = (typeof PHASES)[number];

export const PHASE_LABEL: Record<Phase, string> = {
  REGISTRATION: "ثبت‌نام و تیم",
  IDEATION: "اتاق ایده",
  SEED_ROUND: "دور سرمایه‌گذاری",
  BUILD: "ساخت محصول",
  MARKET: "روز بازار",
  AUCTION: "حراج زنده",
  CLOSED: "پایان بازی",
};

export const PHASE_DESC: Record<Phase, string> = {
  REGISTRATION: "شخصیتت را بساز، تیم سه‌نفره‌ات را کامل کن.",
  IDEATION: "۲۴ ساعت وقت داری ایده‌ات را ثبت کنی و سرمایه بخواهی.",
  SEED_ROUND: "با کیف بذر روی ایده‌های تیم‌های دیگر سرمایه‌گذاری کن.",
  BUILD: "۴۸ ساعت: محصول، تیزر، تصاویر و صفحهٔ محصول.",
  MARKET: "با کیف خرید از تیم‌های دیگر بخر و قلب بده.",
  AUCTION: "نسخه‌های ویژه زنده حراج می‌شوند.",
  CLOSED: "سودها پرداخت شد. نتایج را ببین.",
};

/** فاز جاری و زمان پایان آن (از جدول Setting) */
export async function getPhase(): Promise<{ phase: Phase; endsAt: Date | null }> {
  const rows = await prisma.setting.findMany({ where: { key: { in: ["phase", "phase_ends_at"] } } });
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const phase = (PHASES as readonly string[]).includes(map.phase) ? (map.phase as Phase) : "REGISTRATION";
  const endsAt = map.phase_ends_at ? new Date(map.phase_ends_at) : null;
  return { phase, endsAt };
}

export async function setPhase(phase: Phase, endsAt: Date | null) {
  await prisma.setting.upsert({ where: { key: "phase" }, update: { value: phase }, create: { key: "phase", value: phase } });
  await prisma.setting.upsert({
    where: { key: "phase_ends_at" },
    update: { value: endsAt ? endsAt.toISOString() : "" },
    create: { key: "phase_ends_at", value: endsAt ? endsAt.toISOString() : "" },
  });
}

export function phaseIndex(p: Phase) {
  return PHASES.indexOf(p);
}

/** آیا فاز جاری حداقل به فاز داده‌شده رسیده است */
export function phaseAtLeast(current: Phase, target: Phase) {
  return phaseIndex(current) >= phaseIndex(target);
}

export async function getSetting(key: string, fallback: string) {
  const row = await prisma.setting.findUnique({ where: { key } });
  return row?.value ?? fallback;
}
export async function getSettingInt(key: string, fallback: number) {
  const v = await getSetting(key, String(fallback));
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}
