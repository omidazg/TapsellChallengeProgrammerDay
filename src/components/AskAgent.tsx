"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type ChatMsg = { role: "user" | "assistant"; content: string };

const GREETING: ChatMsg = {
  role: "assistant",
  content: "سلام! من دستیار سؤال‌وجواب میدان بنیان‌گذارانم. هر سؤالی دربارهٔ قوانین، زمان‌بندی یا جوایز مسابقه داری بپرس.",
};

/** سؤال‌های پرتکرار؛ زیر پیام خوشامد نشان داده می‌شوند و با یک کلیک فرستاده می‌شوند. */
const SUGGESTED_QUESTIONS = [
  "جریمهٔ سکهٔ خرج‌نشده چطور حساب می‌شود؟",
  "سپر چه کار می‌کند؟",
  "امتیاز نهایی چطور حساب می‌شود؟",
  "در این فاز چه کار کنم؟",
];

/** `loggedIn`: /api/assistant فقط برای کاربران واردشده پاسخ می‌دهد؛ مهمان به‌جای گفت‌وگو دعوت به ورود می‌بیند. */
export function AskAgent({ loggedIn = true }: { loggedIn?: boolean }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([GREETING]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // با باز شدن پنل فوکوس به ورودی می‌رود و Escape پنل را می‌بندد و فوکوس را به دکمه برمی‌گرداند
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const hasUserMessage = messages.some((m) => m.role === "user");

  async function send(override?: string) {
    const text = (override ?? input).trim();
    if (!text || pending) return;
    setError(null);
    const prev = messages;
    const next = [...messages, { role: "user", content: text } as ChatMsg];
    setMessages(next);
    setInput("");
    setPending(true);
    // اگر درخواست شکست خورد، پیام کاربر بدون پاسخ نمی‌ماند: از تاریخچه برداشته و به ورودی برمی‌گردد تا دوباره بفرستد
    const rollback = (msg: string) => {
      setMessages(prev);
      setInput(text);
      setError(msg);
    };
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // پیام خوشامد فقط نمایشی است و نباید به‌عنوان تاریخچه به سرور برود
        body: JSON.stringify({ messages: next.filter((m) => m !== GREETING).slice(-12) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || typeof data.reply !== "string") {
        rollback(res.status === 401 ? "برای پرسیدن اول وارد حسابت شو." : (data.error ?? "خطایی رخ داد؛ دوباره بفرست."));
        return;
      }
      setMessages((m) => [...m, { role: "assistant", content: data.reply }]);
      queueMicrotask(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }));
    } catch {
      rollback("ارتباط برقرار نشد؛ دوباره بفرست.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button
        ref={toggleRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="ask-agent-panel"
        aria-label={open ? "بستن دستیار هوش مصنوعی" : "باز کردن دستیار هوش مصنوعی"}
        // فاصله از پایین به ارتفاع نوار پایینی موبایل (اگر باشد) اضافه می‌شود تا روی آن نیفتد
        style={{ bottom: "calc(var(--bottom-nav-h, 0px) + 1rem)" }}
        className="print:hidden fixed left-4 z-50 size-14 rounded-full bg-brand-navy text-white shadow-lift flex items-center justify-center text-2xl hover:opacity-90 transition"
      >
        <span aria-hidden>{open ? "✕" : "🤖"}</span>
      </button>

      {open && (
        <div
          id="ask-agent-panel"
          role="dialog"
          aria-label="دستیار سؤال‌وجواب مسابقه"
          className="print:hidden fixed left-4 z-50 w-[92vw] max-w-sm card p-0 flex flex-col overflow-hidden shadow-lift"
          style={{
            bottom: "calc(var(--bottom-nav-h, 0px) + 5rem)",
            height: "min(70vh, calc(100dvh - var(--bottom-nav-h, 0px) - 6.5rem), 520px)",
          }}
        >
          <div className="flex items-start justify-between gap-2 px-4 py-3 border-b border-brand-mist bg-brand-ice">
            <div className="min-w-0">
              <div className="font-black text-brand-navy text-sm">دستیار سؤال‌وجواب مسابقه</div>
              <div className="text-xs text-brand-slate">پاسخ‌ها بر اساس قوانین رسمی بازی است.</div>
            </div>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                toggleRef.current?.focus();
              }}
              aria-label="بستن دستیار"
              className="shrink-0 size-8 -m-1 rounded-full flex items-center justify-center text-brand-slate hover:bg-brand-mist hover:text-brand-navy transition"
            >
              <span aria-hidden>✕</span>
            </button>
          </div>

          <div ref={listRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2" aria-live="polite">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-start" : "justify-end"}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-6 ${
                    m.role === "user" ? "bg-brand-mist text-brand-navy" : "bg-brand-navy text-white"
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {loggedIn && !hasUserMessage && !pending && (
              <div className="flex flex-wrap justify-end gap-1.5 pt-1" aria-label="سؤال‌های پیشنهادی">
                {SUGGESTED_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => send(q)}
                    className="rounded-pill border border-brand-mist bg-brand-ice px-3 py-1.5 text-xs font-bold text-brand-navy text-start hover:border-brand-cyan-dark hover:bg-brand-mist transition"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
            {pending && <div className="text-xs text-brand-slate px-1">در حال نوشتن پاسخ...</div>}
            {error && <div role="alert" className="text-xs text-brand-red px-1">{error}</div>}
          </div>

          {!loggedIn ? (
            <div className="border-t border-brand-mist p-3 flex items-center justify-between gap-2 text-xs text-brand-slate">
              <span>برای پرسیدن از دستیار، وارد حسابت شو.</span>
              <Link href="/login" onClick={() => setOpen(false)} className="btn-primary !py-2 !px-4 !text-sm shrink-0">
                ورود
              </Link>
            </div>
          ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            className="border-t border-brand-mist p-2 flex items-center gap-2"
          >
            <input
              ref={inputRef}
              aria-label="سؤال از دستیار"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="سؤالت را بنویس..."
              maxLength={1000}
              disabled={pending}
              className="flex-1 rounded-pill border border-brand-mist px-3.5 py-2 text-sm outline-none focus:border-brand-cyan-dark"
            />
            <button type="submit" disabled={pending || !input.trim()} className="btn-primary !py-2 !px-4 !text-sm disabled:opacity-50">
              ارسال
            </button>
          </form>
          )}
        </div>
      )}
    </>
  );
}
