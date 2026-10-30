"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { setSetting } from "@/lib/admin";
import { getPhase, setPhase } from "@/lib/phase";
import { transitionTo } from "@/lib/phase-transition";
import { notifyAll } from "@/lib/notifications";
import { invalidate } from "@/lib/ttl-cache";
import {
  BAZAAR_SOURCES,
  MODULE_KEYS,
  MODULE_LABEL,
  MODULE_STATUSES,
  addModuleException,
  getModuleStatus,
  removeModuleException,
  setModuleStatus,
  type ModuleKey,
  type ModuleStatus,
} from "@/lib/module-state";

export type ControlActionState = { error?: string; ok?: boolean };

const STATUS_NOTICE: Record<ModuleStatus, string> = {
  open: "باز شد",
  ro: "فقط‌خواندنی شد",
  closed: "بسته شد",
  hidden: "فعلاً در دسترس نیست",
};

/** وضعیت بخش‌ها روی ناوبری و همهٔ صفحه‌ها اثر دارد */
function revalidateEverything() {
  revalidatePath("/", "layout");
}

const statusSchema = z.object({
  kind: z.enum(["module", "track"]),
  id: z.string().min(1),
  status: z.enum(MODULE_STATUSES),
  notify: z.boolean(),
});

/** تغییر وضعیت یک بخش یا محور، با اعلان اختیاری به همه (تصمیم ۷.۲) */
export async function setStatusAction(prevState: ControlActionState, formData: FormData): Promise<ControlActionState> {
  const admin = await requireAdmin();
  const parsed = statusSchema.safeParse({
    kind: formData.get("kind"),
    id: formData.get("id"),
    status: formData.get("status"),
    notify: formData.get("notify") === "1",
  });
  if (!parsed.success) return { error: "ورودی نامعتبر است" };
  const { kind, id, status, notify } = parsed.data;

  let label: string;
  if (kind === "module") {
    if (!(MODULE_KEYS as readonly string[]).includes(id)) return { error: "بخش نامعتبر است" };
    const key = id as ModuleKey;
    const before = await getModuleStatus(key);
    if (before === status) return { error: "وضعیت همین حالا هم همین است" };
    label = `بخش «${MODULE_LABEL[key]}»`;
    await setModuleStatus(key, status);
    await audit(admin.id, "module.set_status", key, { before, after: status, notify });
  } else {
    const track = await prisma.track.findUnique({ where: { id }, select: { name: true, status: true } });
    if (!track) return { error: "محور پیدا نشد" };
    if (track.status === status) return { error: "وضعیت همین حالا هم همین است" };
    label = `محور «${track.name}»`;
    await prisma.track.update({ where: { id }, data: { status } });
    // محور مخفی در امتیاز حساب نمی‌شود.
    invalidate("scores:");
    await audit(admin.id, "track.set_status", id, { before: track.status, after: status, notify });
  }

  if (notify) {
    await notifyAll({ kind: "module_status", title: `${label} ${STATUS_NOTICE[status]}`, href: "/" }).catch((e) =>
      console.error("notifyAll failed", e)
    );
  }
  revalidateEverything();
  return { ok: true };
}

/** منبع آمار بازار استودیو: دستی/اکسل، API یا غیرفعال */
export async function setBazaarSourceAction(prevState: ControlActionState, formData: FormData): Promise<ControlActionState> {
  const admin = await requireAdmin();
  const parsed = z.enum(BAZAAR_SOURCES).safeParse(formData.get("source"));
  if (!parsed.success) return { error: "منبع نامعتبر است" };
  const before = await prisma.setting.findUnique({ where: { key: "bazaar_source" } });
  await setSetting("bazaar_source", parsed.data);
  await audit(admin.id, "bazaar.set_source", "", { before: before?.value ?? null, after: parsed.data });
  revalidatePath("/admin/control");
  revalidatePath("/admin/bazaar");
  return { ok: true };
}

const exceptionSchema = z.object({
  moduleKey: z.string().min(1, "بخش یا محور را انتخاب کن"),
  teamId: z.string().min(1, "تیم را انتخاب کن"),
});

/** باز کردن یک بخش یا محور فقط برای یک تیم (تصمیم ۷.۳). کلید محور `track:<id>` است. */
export async function addExceptionAction(prevState: ControlActionState, formData: FormData): Promise<ControlActionState> {
  const admin = await requireAdmin();
  const parsed = exceptionSchema.safeParse({ moduleKey: formData.get("moduleKey") ?? "", teamId: formData.get("teamId") ?? "" });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "ورودی نامعتبر است" };
  const { moduleKey, teamId } = parsed.data;

  if (moduleKey.startsWith("track:")) {
    const track = await prisma.track.findUnique({ where: { id: moduleKey.slice("track:".length) }, select: { id: true } });
    if (!track) return { error: "محور پیدا نشد" };
  } else if (!(MODULE_KEYS as readonly string[]).includes(moduleKey)) {
    return { error: "بخش نامعتبر است" };
  }
  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { name: true } });
  if (!team) return { error: "تیم پیدا نشد" };

  await addModuleException(moduleKey, teamId, admin.id);
  await audit(admin.id, "module.exception_add", moduleKey, { teamId, teamName: team.name });
  revalidateEverything();
  return { ok: true };
}

export async function removeExceptionAction(prevState: ControlActionState, formData: FormData): Promise<ControlActionState> {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const row = await prisma.moduleException.findUnique({ where: { id } });
  if (!row) return { error: "این استثنا پیدا نشد" };
  await removeModuleException(id);
  await audit(admin.id, "module.exception_remove", row.moduleKey, { teamId: row.teamId });
  revalidateEverything();
  return { ok: true };
}

/** ددلاین نهایی: تنها زمان‌بندی باقی‌مانده. با رسیدن به آن، زمان‌بند مسابقه را می‌بندد. خالی یعنی بدون ددلاین. */
export async function setDeadlineAction(prevState: ControlActionState, formData: FormData): Promise<ControlActionState> {
  const admin = await requireAdmin();
  const raw = String(formData.get("endsAt") ?? "").trim();
  const endsAt = raw ? new Date(raw) : null;
  if (endsAt && Number.isNaN(endsAt.getTime())) return { error: "زمان نامعتبر است" };
  // ددلاین گذشته مسابقه را در نوبت بعدی زمان‌بند می‌بندد؛ برای این کار دکمهٔ «پایان مسابقه» هست. یک دقیقه تلورانس.
  if (endsAt && endsAt.getTime() < Date.now() - 60_000) {
    return { error: "زمان ددلاین گذشته است؛ یک زمان آینده انتخاب کن یا فیلد را خالی بگذار." };
  }
  const before = await getPhase();
  if (before.phase === "CLOSED") return { error: "مسابقه تمام شده است." };
  await setPhase(before.phase, endsAt);
  await audit(admin.id, "contest.deadline", "", {
    before: before.endsAt ? before.endsAt.toISOString() : null,
    after: endsAt ? endsAt.toISOString() : null,
  });
  revalidateEverything();
  return { ok: true };
}

/** پایان دستی مسابقه: همان مسیر زمان‌بند (برداشت آمار، بستن حراج، تسویه و ارزیابی نهایی). */
export async function endContestAction(): Promise<ControlActionState> {
  const admin = await requireAdmin();
  const { phase, endsAt } = await getPhase();
  if (phase === "CLOSED") return { error: "مسابقه از قبل تمام شده است." };
  const result = await transitionTo("CLOSED", endsAt);
  await audit(admin.id, "contest.end", "", {
    endsAt: endsAt ? endsAt.toISOString() : null,
    ...(result.settleFailed ? { settleFailed: true } : {}),
  });
  revalidateEverything();
  if (result.settleFailed) {
    return { error: "مسابقه بسته شد ولی تسویهٔ نهایی با خطا روبه‌رو شد؛ از صفحهٔ «تسویهٔ نهایی» دوباره اجرا کن." };
  }
  return { ok: true };
}
