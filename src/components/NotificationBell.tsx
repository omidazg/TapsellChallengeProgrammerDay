"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { fa } from "@/lib/persian";
import { PHASE_LABEL, type Phase } from "@/lib/phases";

type NotificationItem = {
  id: string;
  kind: string;
  title: string;
  body: string;
  href: string;
  readAt: string | null;
  createdAt: string;
};

type NotificationsResponse = { unread: number; items: NotificationItem[]; phase: Phase };

const POLL_MS = 20_000;

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return "همین الان";
  const m = Math.floor(s / 60);
  if (m < 60) return `${fa(m)} دقیقه پیش`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${fa(h)} ساعت پیش`;
  const d = Math.floor(h / 24);
  return `${fa(d)} روز پیش`;
}

export function NotificationBell({ phase, variant = "desktop" }: { phase: Phase; variant?: "desktop" | "mobile" }) {
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const lastPhase = useRef<Phase>(phase);
  const popRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();

  useEffect(() => {
    let stop = false;
    async function poll() {
      try {
        const res = await fetch("/api/notifications", { cache: "no-store" });
        if (!res.ok || stop) return;
        const data: NotificationsResponse = await res.json();
        if (stop) return;
        setUnread(data.unread);
        setItems(data.items);
        if (lastPhase.current !== data.phase) {
          setToast(`فاز بازی تغییر کرد: ${PHASE_LABEL[data.phase]}`);
        }
        lastPhase.current = data.phase;
      } catch {
        /* نادیده گرفتن خطای شبکه */
      }
    }
    poll();
    const t = setInterval(poll, POLL_MS);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const onToggle = useCallback(() => {
    setOpen((o) => {
      const next = !o;
      if (next && unread > 0) {
        fetch("/api/notifications/read", { method: "POST" })
          .then(() => setUnread(0))
          .catch(() => {});
      }
      return next;
    });
  }, [unread]);

  return (
    <div className="relative" ref={popRef}>
      <button
        type="button"
        onClick={onToggle}
        aria-label="اعلان‌ها"
        aria-expanded={open}
        className={
          variant === "desktop"
            ? "relative flex items-center justify-center size-10 rounded-full border border-brand-mist text-brand-navy hover:bg-brand-ice shrink-0"
            : "relative flex items-center gap-2 rounded-2xl bg-brand-ice px-3 py-3 text-sm font-bold text-brand-navy min-h-12 w-full"
        }
      >
        <span aria-hidden className="text-lg leading-none">🔔</span>
        {variant === "mobile" && <span>اعلان‌ها</span>}
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-brand-red text-white text-[10px] font-black flex items-center justify-center fa-num">
            {fa(unread)}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 sm:left-auto sm:right-0 mt-2 w-80 max-w-[90vw] card shadow-lift z-50 overflow-hidden anim-pop">
          <div className="px-4 py-3 border-b border-brand-mist flex items-center justify-between">
            <span className="font-black text-brand-navy text-sm">اعلان‌ها</span>
            <Link href="/notifications" className="text-xs font-bold text-brand-cyan-dark" onClick={() => setOpen(false)}>
              همه
            </Link>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-brand-slate">اعلانی نداری.</div>
            ) : (
              <ul>
                {items.map((n) => (
                  <li key={n.id} className="border-b border-brand-mist last:border-0">
                    <Link
                      href={n.href || "/notifications"}
                      onClick={() => setOpen(false)}
                      className={`block px-4 py-3 hover:bg-brand-ice ${!n.readAt ? "bg-brand-ice/60" : ""}`}
                    >
                      <div className="text-sm font-bold text-brand-navy break-words">{n.title}</div>
                      {n.body && <div className="text-xs text-brand-slate mt-0.5 break-words">{n.body}</div>}
                      <div className="text-[11px] text-brand-slate mt-1">{relativeTime(n.createdAt)}</div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {toast && (
        <PhaseToast
          message={toast}
          onRefresh={() => {
            setToast(null);
            router.refresh();
          }}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}

function PhaseToast({ message, onRefresh, onClose }: { message: string; onRefresh: () => void; onClose: () => void }) {
  return (
    <div className="fixed bottom-4 inset-x-4 sm:inset-x-auto sm:left-4 z-[60] anim-rise">
      <div className="card px-4 py-3 shadow-lift flex items-center gap-3 max-w-sm">
        <span className="text-xl" aria-hidden>📣</span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-brand-navy break-words">{message}</div>
        </div>
        <button type="button" onClick={onRefresh} className="btn-primary !py-1.5 !px-3 text-xs shrink-0">
          به‌روزرسانی
        </button>
        <button type="button" onClick={onClose} aria-label="بستن" className="text-brand-slate text-lg leading-none shrink-0">
          ✕
        </button>
      </div>
    </div>
  );
}
