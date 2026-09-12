import { prisma } from "./db";
import { PHASES, type Phase } from "./phases";

export * from "./phases";

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

export async function getSetting(key: string, fallback: string) {
  const row = await prisma.setting.findUnique({ where: { key } });
  return row?.value ?? fallback;
}
export async function getSettingInt(key: string, fallback: number) {
  const v = await getSetting(key, String(fallback));
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}
/** برای مقادیر اعشاری مثل penalty_per_coin */
export async function getSettingFloat(key: string, fallback: number) {
  const v = await getSetting(key, String(fallback));
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}
