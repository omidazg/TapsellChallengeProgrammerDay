import { prisma } from "./db";

/**
 * ثبت یک کار ادمین در AuditLog.
 * هیچ‌وقت خطا پرتاب نمی‌کند: شکست ثبت گزارش نباید خود عملیات را خراب کند.
 *
 * نام‌گذاری action: «حوزه.فعل» مثل `phase.set`، `settlement.run`، `user.reset_password`.
 */
export async function audit(
  actorId: string | null,
  action: string,
  target = "",
  detail?: Record<string, unknown>
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId,
        action,
        target,
        detail: detail ? JSON.stringify(detail) : "",
      },
    });
  } catch (err) {
    console.error("[audit] failed to write log", action, err);
  }
}
