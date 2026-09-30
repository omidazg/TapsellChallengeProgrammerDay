/**
 * کپی متن در کلیپ‌بورد.
 * `navigator.clipboard` فقط در secure context (HTTPS یا localhost) وجود دارد؛
 * پشت reverse proxy روی HTTP تعریف‌نشده است، پس به `execCommand("copy")` برمی‌گردیم.
 */
export async function copyText(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      /* می‌رویم سراغ روش قدیمی */
    }
  }
  return legacyCopy(text);
}

function legacyCopy(text: string): boolean {
  if (typeof document === "undefined") return false;
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.top = "0";
  ta.style.left = "0";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  const prevFocus = document.activeElement as HTMLElement | null;
  ta.focus();
  ta.select();
  ta.setSelectionRange(0, text.length);
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  document.body.removeChild(ta);
  prevFocus?.focus?.();
  return ok;
}
