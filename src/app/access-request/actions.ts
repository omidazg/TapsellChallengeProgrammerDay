"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";
import { rateLimit, rateLimitMessage, clientIp, ACCESS_REQUEST_IP_RULE, ACCESS_STATUS_IP_RULE } from "@/lib/rate-limit";
import { ACCESS_STATUS_LABEL, accessState, canRegister, normalizeEmail } from "@/lib/whitelist";
import { moduleOpen } from "@/lib/module-state";
import { normalizePhone } from "@/lib/phone";

type AccessRequestFields = { email: string; firstName: string; lastName: string; position: string; unit: string; phone: string };

/**
 * `values` مقادیر ارسالی را پس از خطا برمی‌گرداند: React 19 پس از هر form action فیلدهای
 * کنترل‌نشده را ریست می‌کند و بدون آن کاربر باید همه‌چیز را از نو تایپ کند.
 */
export type AccessRequestState = {
  error?: string;
  ok?: "CREATED" | "UPDATED" | "ALLOWED" | "HAS_ACCOUNT";
  /** ایمیل نرمال‌شده پس از موفقیت؛ برای لینک ثبت‌نام و پرکردن جعبهٔ پیگیری */
  email?: string;
  values?: AccessRequestFields;
};

const FIELD_ERRORS: Record<string, string> = {
  email: "ایمیل نامعتبر است.",
  firstName: "نام را وارد کن (۲ تا ۴۰ نویسه).",
  lastName: "نام خانوادگی را وارد کن (۲ تا ۴۰ نویسه).",
  position: "سمت را وارد کن (۲ تا ۶۰ نویسه).",
  unit: "واحد سازمانی را وارد کن (۲ تا ۶۰ نویسه).",
  phone: "شمارهٔ موبایل معتبر نیست؛ مثلاً ۰۹۱۲۱۲۳۴۵۶۷.",
};

const requestSchema = z.object({
  email: z.string().trim().toLowerCase().max(120).email(),
  firstName: z.string().trim().min(2).max(40),
  lastName: z.string().trim().min(2).max(40),
  position: z.string().trim().min(2).max(60),
  unit: z.string().trim().min(2).max(60),
  phone: z.string().transform((v, ctx) => {
    const p = normalizePhone(v);
    if (!p) ctx.addIssue({ code: "custom", message: "phone" });
    return p ?? "";
  }),
});

export async function submitAccessRequestAction(_prev: AccessRequestState, formData: FormData): Promise<AccessRequestState> {
  const str = (k: string) => {
    const v = formData.get(k);
    return typeof v === "string" ? v.slice(0, 200) : "";
  };
  const values: AccessRequestFields = {
    email: str("email"),
    firstName: str("firstName"),
    lastName: str("lastName"),
    position: str("position"),
    unit: str("unit"),
    phone: str("phone"),
  };

  if (await getSessionUserId()) return { error: "از قبل وارد شده‌ای.", values };

  const ip = await clientIp();
  const limit = rateLimit("access-request:ip", ip, ACCESS_REQUEST_IP_RULE());
  if (!limit.ok) return { error: rateLimitMessage(limit.retryAfterSec), values };

  const parsed = requestSchema.safeParse(values);
  if (!parsed.success) {
    const key = String(parsed.error.issues[0]?.path[0] ?? "");
    return { error: FIELD_ERRORS[key] ?? "اطلاعات واردشده نامعتبر است.", values };
  }
  const data = parsed.data;

  const user = await prisma.user.findFirst({ where: { OR: [{ email: data.email }, { phone: data.phone }] }, select: { id: true } });
  if (user) return { ok: "HAS_ACCOUNT" };
  if (await canRegister(data.email)) return { ok: "ALLOWED", email: data.email };

  // یک درخواست برای هر ایمیل، و فرم بدون ورود است: ارسال دوباره هرگز درخواست موجود را بازنویسی
  // نمی‌کند. وگرنه هر کسی می‌توانست با ایمیل دیگری شمارهٔ خودش را جا بزند و با تأیید برگزارکننده
  // همان شماره به لیست سفید می‌رفت، یا درخواست ردشده را بی‌صدا دوباره به صف بفرستد.
  const existing = await prisma.accessRequest.findUnique({ where: { email: data.email }, select: { status: true } });
  if (existing) return { error: existingRequestMessage(existing.status), values };
  try {
    await prisma.accessRequest.create({ data });
  } catch (e) {
    // دو ارسال هم‌زمان با یک ایمیل: دومی به کلید یکتا می‌خورد
    if ((e as { code?: string })?.code === "P2002") return { error: existingRequestMessage("PENDING"), values };
    throw e;
  }
  return { ok: "CREATED", email: data.email };
}

/** پیام درخواست تکراری؛ وضعیت فعلی گفته می‌شود ولی هیچ دادهٔ شخصیِ درخواست قبلی نه */
function existingRequestMessage(status: string): string {
  const label = ACCESS_STATUS_LABEL[status] ?? status;
  const next =
    status === "PENDING"
      ? "منتظر بررسی برگزارکننده بمان؛ وضعیتش را از بخش پیگیری پایین همین صفحه ببین."
      : status === "APPROVED"
        ? "اگر هنوز نمی‌توانی ثبت‌نام کنی، با برگزارکننده تماس بگیر."
        : "اگر فکر می‌کنی اشتباهی رخ داده یا باید اطلاعاتش (مثلاً شماره) عوض شود، با برگزارکننده تماس بگیر.";
  return `برای این ایمیل قبلاً درخواست دسترسی ثبت شده (وضعیت: ${label}). ${next}`;
}

export type AccessStatus = "PENDING" | "ALLOWED" | "REJECTED" | "NONE" | "HAS_ACCOUNT";
export type AccessStatusResult = { status: AccessStatus; registrationOpen: boolean } | { error: string };

/**
 * پیگیری وضعیت درخواست دسترسی با ایمیل. فقط وضعیت برمی‌گردد، نه هیچ دادهٔ شخصی
 * (نام، شماره، سمت و…). همان اطلاعاتی است که صفحهٔ ورود هم با ایمیل می‌دهد، ولی سقف IP
 * جداگانه دارد تا ابزار شمارش ایمیل‌ها نشود.
 */
export async function checkAccessStatusAction(rawEmail: string): Promise<AccessStatusResult> {
  const parsed = z.string().trim().toLowerCase().max(120).email().safeParse(String(rawEmail ?? ""));
  if (!parsed.success) return { error: FIELD_ERRORS.email };

  const limit = rateLimit("access-status:ip", await clientIp(), ACCESS_STATUS_IP_RULE());
  if (!limit.ok) return { error: rateLimitMessage(limit.retryAfterSec) };

  const email = normalizeEmail(parsed.data);
  const registrationOpen = await moduleOpen("registration");
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (user) return { status: "HAS_ACCOUNT", registrationOpen };
  return { status: await accessState(email), registrationOpen };
}
