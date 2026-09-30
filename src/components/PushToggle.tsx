"use client";

import { useEffect, useState } from "react";

type Status =
  | "checking"
  | "unsupported"
  | "not-configured"
  | "denied"
  | "off"
  | "on"
  | "busy";

function urlBase64ToUint8Array(base64: string): BufferSource {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const base64Safe = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64Safe);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output.buffer as ArrayBuffer;
}

async function waitForServiceWorkerReady(timeoutMs = 8000): Promise<ServiceWorkerRegistration | null> {
  try {
    const race = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
    return race;
  } catch {
    return null;
  }
}

export type EnablePushResult =
  | { ok: true }
  | { ok: false; status: "unsupported" | "not-configured" | "denied" | "off"; error?: string };

/**
 * گرفتن اجازهٔ اعلان، اشتراک push و ثبت آن روی سرور. بین PushToggle (صفحهٔ اعلان‌ها)
 * و PushPrompt (بنر پیشنهاد در لحظهٔ مناسب) مشترک است. باید از داخل یک کلیک کاربر صدا زده شود.
 */
export async function enablePush(): Promise<EnablePushResult> {
  try {
    if (typeof Notification === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      return { ok: false, status: "unsupported" };
    }
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      return { ok: false, status: permission === "denied" ? "denied" : "off" };
    }

    const reg = await waitForServiceWorkerReady();
    if (!reg) {
      return { ok: false, status: "off", error: "ثبت service worker به‌موقع کامل نشد؛ دوباره تلاش کن." };
    }

    const keyRes = await fetch("/api/push/key", { cache: "no-store" });
    const keyData = await keyRes.json();
    if (!keyData.publicKey) {
      return { ok: false, status: "not-configured" };
    }

    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(keyData.publicKey),
    });

    const json = subscription.toJSON();
    const subRes = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
    });
    if (!subRes.ok) {
      return { ok: false, status: "off", error: "ثبت اشتراک اعلان با خطا مواجه شد." };
    }
    return { ok: true };
  } catch {
    return { ok: false, status: "off", error: "فعال‌سازی اعلان فوری ممکن نشد." };
  }
}

export function PushToggle() {
  const [status, setStatus] = useState<Status>("checking");
  const [message, setMessage] = useState<string>("");
  const [error, setError] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    async function init() {
      if (typeof window === "undefined" || !("isSecureContext" in window) || !window.isSecureContext || !("PushManager" in window) || !("serviceWorker" in navigator)) {
        if (!cancelled) setStatus("unsupported");
        return;
      }
      if (typeof Notification !== "undefined" && Notification.permission === "denied") {
        if (!cancelled) setStatus("denied");
        return;
      }

      const res = await fetch("/api/push/key", { cache: "no-store" }).catch(() => null);
      const data = res && res.ok ? await res.json().catch(() => null) : null;
      if (!data || !data.publicKey) {
        if (!cancelled) setStatus("not-configured");
        return;
      }

      try {
        const reg = await navigator.serviceWorker.getRegistration();
        const existing = reg ? await reg.pushManager.getSubscription() : null;
        if (!cancelled) setStatus(existing ? "on" : "off");
      } catch {
        if (!cancelled) setStatus("off");
      }
    }
    init();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleEnable() {
    setError("");
    setStatus("busy");
    const result = await enablePush();
    if (result.ok) {
      setMessage("اعلان فوری فعال شد.");
      setStatus("on");
      return;
    }
    if (result.error) setError(result.error);
    setStatus(result.status);
  }

  async function handleDisable() {
    setError("");
    setStatus("busy");
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const subscription = reg ? await reg.pushManager.getSubscription() : null;
      if (subscription) {
        const endpoint = subscription.endpoint;
        await subscription.unsubscribe().catch(() => {});
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint }),
        }).catch(() => {});
      }
      setMessage("اعلان فوری غیرفعال شد.");
      setStatus("off");
    } catch {
      setError("غیرفعال‌سازی اعلان فوری ممکن نشد.");
      setStatus("off");
    }
  }

  if (status === "checking") return null;

  if (status === "unsupported") {
    return (
      <div className="card p-4 sm:p-5">
        <div className="font-bold text-brand-navy">اعلان فوری</div>
        <p className="mt-1 text-sm text-brand-slate" aria-live="polite">
          مرورگر یا اتصال فعلی از اعلان فوری پشتیبانی نمی‌کند؛ نیاز به HTTPS دارد.
        </p>
      </div>
    );
  }

  if (status === "not-configured") {
    return (
      <div className="card p-4 sm:p-5">
        <div className="font-bold text-brand-navy">اعلان فوری</div>
        <p className="mt-1 text-sm text-brand-slate" aria-live="polite">
          اعلان فوری فعلاً روی این سرور تنظیم نشده است.
        </p>
      </div>
    );
  }

  if (status === "denied") {
    return (
      <div className="card p-4 sm:p-5">
        <div className="font-bold text-brand-navy">اعلان فوری</div>
        <p className="mt-1 text-sm text-brand-slate" aria-live="polite">
          دسترسی اعلان مسدود شده است. برای فعال‌سازی، از تنظیمات مرورگر (کنار نوار آدرس) اجازهٔ اعلان این سایت را بده و صفحه را تازه کن.
        </p>
      </div>
    );
  }

  const isOn = status === "on";
  const isBusy = status === "busy";

  return (
    <div className="card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-bold text-brand-navy">اعلان فوری</div>
          <p className="mt-1 text-sm text-brand-slate" aria-live="polite">
            {error || message || (isOn ? "اعلان فوری برای این دستگاه فعال است." : "با فعال‌سازی، حتی وقتی این تب باز نیست اعلان دریافت می‌کنی.")}
          </p>
        </div>
        <button
          type="button"
          aria-pressed={isOn}
          disabled={isBusy}
          onClick={isOn ? handleDisable : handleEnable}
          className={isOn ? "btn-ghost shrink-0" : "btn-primary shrink-0"}
        >
          {isBusy ? "در حال انجام…" : isOn ? "غیرفعال‌سازی اعلان فوری" : "فعال‌سازی اعلان فوری"}
        </button>
      </div>
    </div>
  );
}
