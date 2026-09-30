"use client";

/**
 * اسکرول به فیلد فرم با شناسهٔ `id` و فوکوس روی آن (یا اولین عنصر فوکوس‌پذیر درونش).
 * اگر فیلد غیرفعال باشد (فرم قفل)، فقط اسکرول انجام می‌شود.
 */
export function focusField(id: string): boolean {
  const el = document.getElementById(id);
  if (!el) return false;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
  const target = el.matches("input, textarea, select, button")
    ? el
    : el.querySelector<HTMLElement>("input:not([type=hidden]), textarea, select, button");
  target?.focus({ preventScroll: true });
  return true;
}

/** پیوند مورد چک‌لیست که به فیلد مربوط در فرم مرکز ساخت می‌رود (بدون JS هم با #id کار می‌کند) */
export function ChecklistLink({ fieldId, className, children }: { fieldId: string; className?: string; children: React.ReactNode }) {
  return (
    <a
      href={`#${fieldId}`}
      className={className}
      onClick={(e) => {
        if (focusField(fieldId)) e.preventDefault();
      }}
    >
      {children}
    </a>
  );
}
