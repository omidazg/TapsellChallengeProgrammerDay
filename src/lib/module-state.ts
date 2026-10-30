import { prisma } from "./db";
import { getPhase } from "./phase";
import {
  MODULE_DEFAULTS,
  MODULE_KEYS,
  MODULE_LABEL,
  MODULES_FROZEN_AT_END,
  isModuleStatus,
  statusVisible,
  type ModuleKey,
  type ModuleStatus,
} from "./modules";

export * from "./modules";

const settingKey = (key: ModuleKey) => `module_${key}`;

/** وضعیت همهٔ بخش‌ها. پس از پایان مسابقه، بخش‌های بازی اگر باز باشند فقط‌خواندنی می‌شوند. */
export async function getModuleStatuses(): Promise<Record<ModuleKey, ModuleStatus>> {
  const [rows, { phase }] = await Promise.all([
    prisma.setting.findMany({ where: { key: { in: MODULE_KEYS.map(settingKey) } } }),
    getPhase(),
  ]);
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const out = {} as Record<ModuleKey, ModuleStatus>;
  for (const key of MODULE_KEYS) {
    const stored = map.get(settingKey(key));
    let status: ModuleStatus = isModuleStatus(stored) ? stored : MODULE_DEFAULTS[key];
    if (phase === "CLOSED" && status === "open" && MODULES_FROZEN_AT_END.includes(key)) status = "ro";
    out[key] = status;
  }
  return out;
}

export async function getModuleStatus(key: ModuleKey): Promise<ModuleStatus> {
  return (await getModuleStatuses())[key];
}

export async function setModuleStatus(key: ModuleKey, status: ModuleStatus) {
  await prisma.setting.upsert({
    where: { key: settingKey(key) },
    update: { value: status },
    create: { key: settingKey(key), value: status },
  });
}

/** آیا برای این تیم استثنا ثبت شده است؟ */
async function hasException(key: string, teamId?: string | null): Promise<boolean> {
  if (!teamId) return false;
  const row = await prisma.moduleException.findUnique({ where: { moduleKey_teamId: { moduleKey: key, teamId } } });
  return !!row;
}

/** آیا این بخش برای این تیم قابل انجام است؟ (باز، یا استثنای همان تیم) */
export async function moduleOpen(key: ModuleKey, teamId?: string | null): Promise<boolean> {
  if ((await getModuleStatus(key)) === "open") return true;
  return hasException(key, teamId);
}

/** متن خطای استاندارد وقتی یک بخش باز نیست. */
export function moduleClosedMessage(key: ModuleKey): string {
  return `بخش «${MODULE_LABEL[key]}» فعلاً باز نیست.`;
}

/** نگهبان سرور-اکشن‌ها: اگر بخش باز باشد null، وگرنه متن خطا. */
export async function moduleGate(key: ModuleKey, teamId?: string | null): Promise<string | null> {
  return (await moduleOpen(key, teamId)) ? null : moduleClosedMessage(key);
}

/** آیا صفحهٔ این بخش برای کاربر دیده می‌شود؟ */
export async function moduleVisible(key: ModuleKey, teamId?: string | null): Promise<boolean> {
  if (statusVisible(await getModuleStatus(key))) return true;
  return hasException(key, teamId);
}

/** وضعیت مؤثر یک بخش در صفحه‌ها از دید یک تیم: استثنای همان تیم بخش را برایش باز می‌کند. */
export async function moduleStatusFor(key: ModuleKey, teamId?: string | null): Promise<ModuleStatus> {
  if (await hasException(key, teamId)) return "open";
  return getModuleStatus(key);
}

/** وضعیت مؤثر همهٔ بخش‌ها از دید یک تیم (برای منو). */
export async function moduleStatusesFor(teamId?: string | null): Promise<Record<ModuleKey, ModuleStatus>> {
  const statuses = await getModuleStatuses();
  if (!teamId) return statuses;
  const rows = await prisma.moduleException.findMany({ where: { teamId }, select: { moduleKey: true } });
  for (const r of rows) {
    if ((MODULE_KEYS as readonly string[]).includes(r.moduleKey)) statuses[r.moduleKey as ModuleKey] = "open";
  }
  return statuses;
}

/** نگهبان محور: محور مخفی یا بسته اجازهٔ ثبت نمی‌دهد (مگر استثنا برای همان تیم). */
export async function trackGate(trackId: string, teamId?: string | null): Promise<string | null> {
  const track = await prisma.track.findUnique({ where: { id: trackId }, select: { status: true, name: true } });
  if (!track) return "محور پیدا نشد.";
  if (track.status === "open") return null;
  if (await hasException(`track:${trackId}`, teamId)) return null;
  return `محور «${track.name}» فعلاً باز نیست.`;
}

export async function listModuleExceptions() {
  return prisma.moduleException.findMany({ orderBy: { createdAt: "desc" } });
}

export async function addModuleException(moduleKey: string, teamId: string, createdBy: string) {
  await prisma.moduleException.upsert({
    where: { moduleKey_teamId: { moduleKey, teamId } },
    update: {},
    create: { moduleKey, teamId, createdBy },
  });
}

export async function removeModuleException(id: string) {
  await prisma.moduleException.deleteMany({ where: { id } });
}
