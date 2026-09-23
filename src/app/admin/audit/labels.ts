/** نگاشت نام فنی هر کنش ادمین به برچسب فارسی خوانا؛ برای کنش‌های ناشناخته نام خام نمایش داده می‌شود. */
export const ACTION_LABELS: Record<string, string> = {
  "phase.set": "تغییر فاز بازی",
  "settlement.run": "اجرای تسویهٔ نهایی",
  "settings.update": "ذخیرهٔ تنظیمات بازی",
  "scheduler.update": "ذخیرهٔ تنظیمات زمان‌بند",
  "team.rename": "تغییر نام تیم",
  "team.remove_member": "حذف عضو از تیم",
  "team.delete": "حذف تیم",
  "team.move_member": "جابه‌جایی عضو بین تیم‌ها",
  "team.merge": "ادغام دو تیم",
  "team.auto_compose": "تشکیل خودکار تیم‌ها",
  "auction.create": "آماده‌سازی صف حراج",
  "auction.start": "شروع حراج بعدی",
  "auction.close": "پایان دستی حراج زنده",
  "adslot.ensure": "ساخت جایگاه‌های تبلیغاتی",
  "adslot.close_due": "بستن جایگاه‌های سررسیده",
  "announcement.create": "ثبت اطلاعیه",
  "announcement.toggle": "تغییر وضعیت اطلاعیه",
  "announcement.delete": "حذف اطلاعیه",
  "jury.score": "ثبت نمرهٔ داوری",
  "flags.run_check": "اجرای بررسی همدستی",
  "user.toggle_admin": "تغییر دسترسی ادمین کاربر",
  "user.adjust_wallet": "تنظیم دستی کیف پول کاربر",
  "user.reset_password": "بازنشانی رمز عبور کاربر",
  "user.block": "مسدودسازی کاربر",
  "user.unblock": "رفع مسدودی کاربر",
};

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

/** پیشوند حوزه (بخش پیش از نقطه) برای گروه‌بندی فیلتر، مثل «team» از «team.rename» */
export function actionDomain(action: string): string {
  return action.split(".")[0] ?? action;
}
