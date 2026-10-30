/**
 * نقش‌های پنل برگزارکننده — بدون وابستگی به دیتابیس (قابل استفاده در کامپوننت‌های کلاینت).
 * ادمین کامل همه‌جا دسترسی دارد؛ داور فقط صفحهٔ داوری و اپراتور بازار استودیو فقط درخواست‌های انتشار و آمار بازار.
 */
export const STAFF_ROLES = ["JUDGE", "STUDIO_OP"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const STAFF_ROLE_LABEL: Record<StaffRole, string> = {
  JUDGE: "داور",
  STUDIO_OP: "اپراتور بازار استودیو",
};

export type PanelRole = "ADMIN" | StaffRole;

/** نقش این کاربر در پنل؛ null یعنی دسترسی به پنل ندارد. */
export function panelRoleOf(user: { isAdmin: boolean; staffRole: string }): PanelRole | null {
  if (user.isAdmin) return "ADMIN";
  return (STAFF_ROLES as readonly string[]).includes(user.staffRole) ? (user.staffRole as StaffRole) : null;
}

/** صفحهٔ شروع هر نقش در پنل */
export function panelHome(role: PanelRole): string {
  if (role === "JUDGE") return "/admin/jury";
  if (role === "STUDIO_OP") return "/admin/studio";
  return "/admin";
}
