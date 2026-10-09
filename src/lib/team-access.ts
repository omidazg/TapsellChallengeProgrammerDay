/**
 * دسترسی به کارهای تیمی (ثبت ایده، محصول، فرستادن به حراج، خرید جایگاه تبلیغاتی، درخواست انتشار).
 * سرپرست وجود ندارد: هر عضو تیم (و شرکت‌کنندهٔ فردی) می‌تواند کارهای تیمش را انجام دهد.
 */

/** آیا این کاربر اجازهٔ تغییرات تیمی دارد؟ null یعنی بله؛ در غیر این صورت پیام فارسیِ دلیل. */
export async function teamManageError(user: { id: string; teamId: string | null }): Promise<string | null> {
  if (!user.teamId) return "ابتدا یک تیم بساز، به تیمی بپیوند یا «شرکت فردی» را انتخاب کن.";
  return null;
}

/** نسخهٔ ساده برای صفحه‌ها: آیا کاربر می‌تواند ویرایش کند، و اگر نه، چرا */
export async function teamAccess(user: { id: string; teamId: string | null }) {
  const reason = await teamManageError(user);
  return { canManage: reason === null, reason };
}
