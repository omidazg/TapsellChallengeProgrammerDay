"use client";

import { jdate, jtime } from "@/lib/persian";

/** زمان پیش‌نویس: امروز فقط ساعت، وگرنه تاریخ و ساعت */
function draftTime(savedAt: number): string {
  const d = new Date(savedAt);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay ? `ساعت ${jtime(d)}` : `${jdate(d, false)}، ساعت ${jtime(d)}`;
}

/** بنر «پیش‌نویس ذخیره‌نشده پیدا شد» برای فرم‌های ایده و محصول (با useDraftAutosave) */
export function DraftBanner({ savedAt, onRestore, onDismiss }: { savedAt: number; onRestore: () => void; onDismiss: () => void }) {
  return (
    <div role="status" className="flex flex-wrap items-center gap-3 rounded-2xl border border-brand-mist bg-brand-ice px-4 py-3 text-sm text-brand-navy anim-pop">
      <span className="flex-1 min-w-0 font-medium">پیش‌نویس ذخیره‌نشده‌ای از {draftTime(savedAt)} پیدا شد</span>
      <div className="flex gap-2 shrink-0">
        <button type="button" className="btn-cyan" onClick={onRestore}>
          بازیابی
        </button>
        <button type="button" className="btn-ghost" onClick={onDismiss}>
          نادیده بگیر
        </button>
      </div>
    </div>
  );
}
