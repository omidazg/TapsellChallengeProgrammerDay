import { fa } from "@/lib/persian";

/** «۲ ساعت پیش»، «چند لحظه پیش» و مانند آن؛ برای زمان‌های خیلی دور به روز برمی‌گردد. */
export function relativeFa(d: Date, now: Date = new Date()): string {
  const ms = now.getTime() - d.getTime();
  if (ms < 0) return "همین الان";
  const s = Math.floor(ms / 1000);
  if (s < 45) return "چند لحظه پیش";
  const m = Math.floor(s / 60);
  if (m < 60) return `${fa(m)} دقیقه پیش`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${fa(h)} ساعت پیش`;
  const day = Math.floor(h / 24);
  if (day < 30) return `${fa(day)} روز پیش`;
  const month = Math.floor(day / 30);
  if (month < 12) return `${fa(month)} ماه پیش`;
  return `${fa(Math.floor(month / 12))} سال پیش`;
}

/** خلاصهٔ کوتاه و خوانا از JSON جزئیات، برای نمایش کنار جدول (بدون بازکردن <details>) */
export function summarizeDetail(raw: string): string {
  if (!raw) return "—";
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    return raw.slice(0, 80);
  }
  if (!obj || typeof obj !== "object") return String(obj);
  const entries = Object.entries(obj as Record<string, unknown>);
  if (entries.length === 0) return "—";
  const parts = entries.slice(0, 3).map(([k, v]) => `${k}: ${summarizeValue(v)}`);
  const suffix = entries.length > 3 ? "…" : "";
  return parts.join("، ") + suffix;
}

function summarizeValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") {
    const keys = Object.keys(v as Record<string, unknown>);
    return `{${keys.length} کلید}`;
  }
  const s = String(v);
  return s.length > 24 ? s.slice(0, 24) + "…" : s;
}

/** JSON خام را برای نمایش داخل <details> با تورفتگی برمی‌گرداند */
export function prettyDetail(raw: string): string {
  if (!raw) return "—";
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}
