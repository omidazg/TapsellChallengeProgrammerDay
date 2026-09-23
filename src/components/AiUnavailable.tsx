const MESSAGES: Record<"off" | "budget" | "cap", string> = {
  off: "تحلیل‌گر هوش مصنوعی در این دوره فعال نیست.",
  budget: "بودجهٔ روزانهٔ هوش مصنوعی امروز تمام شده است؛ فردا دوباره امتحان کن.",
  cap: "به سقف روزانهٔ پرسش‌های هوش مصنوعی رسیده‌ای؛ فردا دوباره امتحان کن.",
};

/** یادآوری ظریف برای وقتی هوش مصنوعی غیرفعال، بودجه‌اش تمام یا سقف کاربر پر شده است. */
export function AiUnavailable({ className = "", reason = "off" }: { className?: string; reason?: "off" | "budget" | "cap" }) {
  return (
    <div className={`rounded-2xl border border-brand-mist bg-brand-ice px-4 py-3 text-xs font-medium text-brand-slate ${className}`}>
      <span aria-hidden>🤖</span> {MESSAGES[reason]}
    </div>
  );
}
