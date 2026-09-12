/** یادآوری ظریف برای وقتی کلید هوش مصنوعی تنظیم نشده و قابلیت‌های تحلیل‌گر غیرفعال‌اند. */
export function AiUnavailable({ className = "" }: { className?: string }) {
  return (
    <div className={`rounded-2xl border border-brand-mist bg-brand-ice px-4 py-3 text-xs font-medium text-brand-slate ${className}`}>
      🤖 تحلیل‌گر هوش مصنوعی در این دوره فعال نیست.
    </div>
  );
}
