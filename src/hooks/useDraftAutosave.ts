"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** مقادیر فرم: هر نام فیلد ← همهٔ مقدارهای آن (فیلدهای چندتایی مثل images) */
export type DraftValues = Record<string, string[]>;

type StoredDraft = { savedAt: number; values: DraftValues };

const PREFIX = "pegah-draft:";
const INTERVAL_MS = 30_000;

function readDraft(key: string): StoredDraft | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const { savedAt, values } = parsed as { savedAt?: unknown; values?: unknown };
    if (typeof savedAt !== "number" || !values || typeof values !== "object") return null;
    const clean: DraftValues = {};
    for (const [k, v] of Object.entries(values as Record<string, unknown>)) {
      if (Array.isArray(v)) clean[k] = v.filter((x): x is string => typeof x === "string");
    }
    return { savedAt, values: clean };
  } catch {
    return null;
  }
}

function writeDraft(key: string, draft: StoredDraft) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(draft));
  } catch {
    // حافظهٔ مرورگر پر/غیرفعال است؛ ذخیرهٔ خودکار بی‌صدا نادیده گرفته می‌شود
  }
}

function removeDraft(key: string) {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    // نادیده
  }
}

function sameValues(fields: readonly string[], a: DraftValues, b: DraftValues): boolean {
  return fields.every((f) => (a[f] ?? []).join("\u0000") === (b[f] ?? []).join("\u0000"));
}

function snapshot(form: HTMLFormElement, fields: readonly string[]): DraftValues {
  const fd = new FormData(form);
  const out: DraftValues = {};
  for (const f of fields) out[f] = fd.getAll(f).map((v) => (typeof v === "string" ? v : ""));
  return out;
}

/**
 * ذخیرهٔ خودکار پیش‌نویس فرم در localStorage (هر ~۳۰ ثانیه و هنگام خروج از هر فیلد).
 *
 * - `key`: کلید یکتا (مثلاً بر پایهٔ تیم و شناسهٔ ایده/محصول).
 * - `fields`: نام فیلدهای فرم که ذخیره/بازیابی می‌شوند.
 * - `baseline`: مقادیر فعلی سرور؛ پیش‌نویسِ برابر با آن ذخیره/نمایش داده نمی‌شود.
 * - `controlled`: برای فیلدهای کنترل‌شده (state ری‌اکت) تابع بازیابی؛ بقیه (uncontrolled با
 *   defaultValue) مستقیم در DOM مقداردهی می‌شوند تا رفتار ری‌ست/بازگرداندن مقادیر پس از خطای
 *   اکشن (React 19) دست نخورد.
 *
 * هنگام بارگذاری، اگر پیش‌نویسی متفاوت با `baseline` پیدا شود، `found` مقدار می‌گیرد تا فرم بنر
 * «بازیابی / نادیده بگیر» را نشان دهد؛ تا تصمیم کاربر، ذخیرهٔ خودکار آن را بازنویسی نمی‌کند.
 */
export function useDraftAutosave({
  key,
  formRef,
  fields,
  baseline,
  enabled = true,
  controlled = {},
}: {
  key: string;
  formRef: React.RefObject<HTMLFormElement | null>;
  fields: readonly string[];
  baseline: DraftValues;
  enabled?: boolean;
  controlled?: Record<string, (values: string[]) => void>;
}) {
  const [found, setFound] = useState<StoredDraft | null>(null);
  // مقادیر متغیر در ref تا توابع پایدار بمانند و بازه/شنونده‌ها با هر رندر دوباره ساخته نشوند
  const latest = useRef({ key, fields, baseline, controlled, pending: false });
  useEffect(() => {
    latest.current = { ...latest.current, key, fields, baseline, controlled };
  });

  useEffect(() => {
    if (!enabled) return;
    const draft = readDraft(key);
    if (!draft) return;
    if (sameValues(latest.current.fields, draft.values, latest.current.baseline)) {
      removeDraft(key);
      return;
    }
    latest.current.pending = true;
    setFound(draft);
  }, [key, enabled]);

  const save = useCallback(() => {
    const form = formRef.current;
    const { key: k, fields: f, baseline: b, pending } = latest.current;
    if (!form || pending) return;
    const values = snapshot(form, f);
    if (sameValues(f, values, b)) {
      removeDraft(k);
      return;
    }
    const prev = readDraft(k);
    if (prev && sameValues(f, prev.values, values)) return;
    writeDraft(k, { savedAt: Date.now(), values });
  }, [formRef]);

  useEffect(() => {
    if (!enabled) return;
    const form = formRef.current;
    const id = window.setInterval(save, INTERVAL_MS);
    // focusout حباب می‌کند (برخلاف blur)، پس یک شنونده روی فرم کافی است
    form?.addEventListener("focusout", save);
    window.addEventListener("pagehide", save);
    return () => {
      window.clearInterval(id);
      form?.removeEventListener("focusout", save);
      window.removeEventListener("pagehide", save);
    };
  }, [enabled, formRef, save]);

  const restore = useCallback(() => {
    const form = formRef.current;
    if (!found || !form) return;
    const { fields: f, controlled: c } = latest.current;
    for (const name of f) {
      const vals = found.values[name];
      if (!vals) continue;
      if (c[name]) {
        c[name](vals);
        continue;
      }
      const el = form.elements.namedItem(name);
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
        el.value = vals[0] ?? "";
      }
    }
    latest.current.pending = false;
    setFound(null);
  }, [found, formRef]);

  /** «نادیده بگیر» و نیز پس از ذخیره/ثبت موفق روی سرور: پیش‌نویس محلی پاک می‌شود */
  const clear = useCallback(() => {
    removeDraft(latest.current.key);
    latest.current.pending = false;
    setFound(null);
  }, []);

  return { found, restore, dismiss: clear, clear };
}
