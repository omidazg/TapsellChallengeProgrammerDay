"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";
import { rateLimit, rateLimitMessage, clientIp, ACCESS_REQUEST_IP_RULE } from "@/lib/rate-limit";
import { canRegister } from "@/lib/whitelist";
import { normalizePhone } from "@/lib/phone";

type AccessRequestFields = { email: string; firstName: string; lastName: string; position: string; unit: string; phone: string };

/**
 * `values` مقادیر ارسالی را پس از خطا برمی‌گرداند: React 19 پس از هر form action فیلدهای
 * کنترل‌نشده را ریست می‌کند و بدون آن کاربر باید همه‌چیز را از نو تایپ کند.
 */
export type AccessRequestState = {
  error?: string;
  ok?: "CREATED" | "UPDATED" | "ALLOWED" | "HAS_ACCOUNT";
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

  if (await getSessionUserId()) return { error: "شما از قبل وارد شده‌اید.", values };

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
  if (await canRegister(data.email)) return { ok: "ALLOWED" };

  // یک درخواست برای هر ایمیل: ارسال دوباره اطلاعات را تازه می‌کند و درخواست ردشده را به صف برمی‌گرداند
  const existing = await prisma.accessRequest.findUnique({ where: { email: data.email }, select: { id: true } });
  await prisma.accessRequest.upsert({
    where: { email: data.email },
    update: { ...data, status: "PENDING", reviewedById: null, reviewedAt: null },
    create: data,
  });
  return { ok: existing ? "UPDATED" : "CREATED" };
}
