"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { setSetting } from "@/lib/admin";
import { WHITELIST_SETTING } from "@/lib/whitelist";
import { fa } from "@/lib/persian";
import { normalizePhone } from "@/lib/phone";

export type WhitelistActionState = { error?: string; ok?: boolean; message?: string };

const PATH = "/admin/whitelist";

const emailSchema = z.string().trim().toLowerCase().max(120).email("ایمیل نامعتبر است");
const entrySchema = z.object({
  email: emailSchema,
  firstName: z.string().trim().max(40, "نام خیلی بلند است"),
  lastName: z.string().trim().max(40, "نام خانوادگی خیلی بلند است"),
  position: z.string().trim().max(60, "سمت خیلی بلند است"),
  unit: z.string().trim().max(60, "واحد سازمانی خیلی بلند است"),
  note: z.string().trim().max(200, "یادداشت خیلی بلند است"),
  // اختیاری؛ خالی یعنی بدون شماره
  phone: z.string().transform((v, ctx) => {
    if (!v.trim()) return null;
    const p = normalizePhone(v);
    if (!p) ctx.addIssue({ code: "custom", message: "شمارهٔ موبایل نامعتبر است" });
    return p;
  }),
});

/** شماره در لیست سفید یکتاست؛ اگر ردیف دیگری آن را دارد پیام خطا برمی‌گرداند */
async function phoneClash(phone: string | null, exceptId?: string) {
  if (!phone) return null;
  const other = await prisma.allowedEmail.findUnique({ where: { phone }, select: { id: true, email: true } });
  return other && other.id !== exceptId ? `این شماره از قبل برای ${other.email} ثبت شده است` : null;
}

function readEntry(formData: FormData) {
  return entrySchema.safeParse({
    email: formData.get("email") ?? "",
    firstName: formData.get("firstName") ?? "",
    lastName: formData.get("lastName") ?? "",
    position: formData.get("position") ?? "",
    unit: formData.get("unit") ?? "",
    note: formData.get("note") ?? "",
    phone: String(formData.get("phone") ?? ""),
  });
}

/** اگر برای این ایمیل درخواستی در صف بود، با افزودن دستی هم تأییدشده حساب شود */
async function closePendingRequest(email: string, adminId: string) {
  await prisma.accessRequest.updateMany({
    where: { email, status: "PENDING" },
    data: { status: "APPROVED", reviewedById: adminId, reviewedAt: new Date() },
  });
}

export async function setWhitelistEnabledAction(_prev: WhitelistActionState, formData: FormData): Promise<WhitelistActionState> {
  const me = await requireAdmin();
  const enabled = formData.get("enabled") === "1";
  await setSetting(WHITELIST_SETTING, enabled ? "1" : "0");
  await audit(me.id, "whitelist.toggle", "", { enabled });
  revalidatePath(PATH);
  return { ok: true };
}

export async function addEntryAction(_prev: WhitelistActionState, formData: FormData): Promise<WhitelistActionState> {
  const me = await requireAdmin();
  const parsed = readEntry(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "ورودی نامعتبر است" };
  const data = parsed.data;

  const exists = await prisma.allowedEmail.findUnique({ where: { email: data.email }, select: { id: true } });
  if (exists) return { error: "این ایمیل از قبل در لیست سفید است" };
  const clash = await phoneClash(data.phone);
  if (clash) return { error: clash };

  await prisma.allowedEmail.create({ data });
  await closePendingRequest(data.email, me.id);
  await audit(me.id, "whitelist.add", data.email, {});
  revalidatePath(PATH);
  return { ok: true, message: `${data.email} به لیست سفید اضافه شد.` };
}

/**
 * افزودن گروهی: هر خط یک نفر.
 * «ایمیل» یا «ایمیل، نام، نام خانوادگی، سمت، واحد، موبایل» (جداکننده: ویرگول انگلیسی/فارسی یا تب).
 */
export async function bulkAddAction(_prev: WhitelistActionState, formData: FormData): Promise<WhitelistActionState> {
  const me = await requireAdmin();
  const raw = String(formData.get("lines") ?? "");
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return { error: "دست‌کم یک ایمیل وارد کن" };
  if (lines.length > 1000) return { error: "حداکثر ۱۰۰۰ خط در هر بار" };

  const invalid: string[] = [];
  const rows = new Map<string, z.infer<typeof entrySchema>>();
  for (const line of lines) {
    const [email = "", firstName = "", lastName = "", position = "", unit = "", phone = ""] = line.split(/[,،\t]/).map((p) => p.trim());
    const parsed = entrySchema.safeParse({ email, firstName, lastName, position, unit, note: "", phone });
    if (!parsed.success) invalid.push(email || line);
    else rows.set(parsed.data.email, parsed.data);
  }

  const existing = await prisma.allowedEmail.findMany({ where: { email: { in: [...rows.keys()] } }, select: { email: true } });
  const existingSet = new Set(existing.map((e) => e.email));
  const fresh = [...rows.values()].filter((r) => !existingSet.has(r.email));

  // شماره‌های تکراری (در همین فهرست یا از قبل) کنار گذاشته می‌شوند؛ خود ایمیل اضافه می‌شود
  const wantedPhones = fresh.map((r) => r.phone).filter((p): p is string => !!p);
  const takenPhones = new Set(
    (await prisma.allowedEmail.findMany({ where: { phone: { in: wantedPhones } }, select: { phone: true } })).map((r) => r.phone)
  );
  let droppedPhones = 0;
  for (const r of fresh) {
    if (!r.phone) continue;
    if (takenPhones.has(r.phone)) {
      r.phone = null;
      droppedPhones++;
    } else takenPhones.add(r.phone);
  }

  if (fresh.length > 0) {
    await prisma.allowedEmail.createMany({ data: fresh });
    for (const r of fresh) await closePendingRequest(r.email, me.id);
    await audit(me.id, "whitelist.bulk_add", "", { added: fresh.length });
  }
  revalidatePath(PATH);

  const parts = [`${fa(fresh.length)} ایمیل اضافه شد`];
  if (existingSet.size) parts.push(`${fa(existingSet.size)} ایمیل از قبل در فهرست بود`);
  if (droppedPhones) parts.push(`${fa(droppedPhones)} شمارهٔ تکراری نادیده گرفته شد`);
  if (invalid.length) parts.push(`${fa(invalid.length)} خط نامعتبر رد شد: ${invalid.slice(0, 5).join("، ")}${invalid.length > 5 ? "…" : ""}`);
  return { ok: true, message: parts.join("؛ ") + "." };
}

export async function updateEntryAction(_prev: WhitelistActionState, formData: FormData): Promise<WhitelistActionState> {
  const me = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const parsed = readEntry(formData);
  if (!id) return { error: "ورودی نامعتبر است" };
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "ورودی نامعتبر است" };
  const data = parsed.data;

  const current = await prisma.allowedEmail.findUnique({ where: { id } });
  if (!current) return { error: "این ردیف پیدا نشد" };
  if (data.email !== current.email) {
    const clash = await prisma.allowedEmail.findUnique({ where: { email: data.email }, select: { id: true } });
    if (clash) return { error: "ایمیل جدید از قبل در لیست سفید است" };
  }
  const phoneTaken = await phoneClash(data.phone, id);
  if (phoneTaken) return { error: phoneTaken };

  await prisma.allowedEmail.update({ where: { id }, data });
  await audit(me.id, "whitelist.update", data.email, current.email !== data.email ? { from: current.email } : {});
  revalidatePath(PATH);
  return { ok: true };
}

export async function deleteEntryAction(_prev: WhitelistActionState, formData: FormData): Promise<WhitelistActionState> {
  const me = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const row = id ? await prisma.allowedEmail.findUnique({ where: { id } }) : null;
  if (!row) return { error: "این ردیف پیدا نشد" };
  await prisma.allowedEmail.delete({ where: { id } });
  await audit(me.id, "whitelist.delete", row.email, {});
  revalidatePath(PATH);
  return { ok: true };
}

/** تأیید درخواست: ایمیل با مشخصات درخواست‌دهنده به لیست سفید می‌رود */
export async function approveRequestAction(_prev: WhitelistActionState, formData: FormData): Promise<WhitelistActionState> {
  const me = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const req = id ? await prisma.accessRequest.findUnique({ where: { id } }) : null;
  if (!req) return { error: "درخواست پیدا نشد" };

  // شمارهٔ درخواست هم به لیست سفید می‌رود (اگر ردیف دیگری آن را نگرفته باشد) تا ورود با پیامک ممکن شود
  const phone = normalizePhone(req.phone);
  const phoneFree = phone && !(await prisma.allowedEmail.findFirst({ where: { phone, NOT: { email: req.email } }, select: { id: true } }));
  const profile = {
    firstName: req.firstName,
    lastName: req.lastName,
    position: req.position,
    unit: req.unit,
    ...(phoneFree ? { phone } : {}),
  };
  await prisma.$transaction([
    prisma.allowedEmail.upsert({
      where: { email: req.email },
      update: profile,
      create: { email: req.email, ...profile, note: "تأیید درخواست دسترسی" },
    }),
    prisma.accessRequest.update({
      where: { id },
      data: { status: "APPROVED", reviewedById: me.id, reviewedAt: new Date() },
    }),
  ]);
  await audit(me.id, "access.approve", req.email, {});
  revalidatePath(PATH);
  revalidatePath("/admin");
  return { ok: true };
}

export async function rejectRequestAction(_prev: WhitelistActionState, formData: FormData): Promise<WhitelistActionState> {
  const me = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const req = id ? await prisma.accessRequest.findUnique({ where: { id } }) : null;
  if (!req) return { error: "درخواست پیدا نشد" };

  await prisma.accessRequest.update({
    where: { id },
    data: { status: "REJECTED", reviewedById: me.id, reviewedAt: new Date() },
  });
  await audit(me.id, "access.reject", req.email, {});
  revalidatePath(PATH);
  revalidatePath("/admin");
  return { ok: true };
}
