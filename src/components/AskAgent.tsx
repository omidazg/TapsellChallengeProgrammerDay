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
  "چطور سکهٔ بیشتر بخرم؟",
  "می‌توانم فردی شرکت کنم؟",
  "امتیاز نهایی چطور حساب می‌شود؟",
  "در این فاز چه کار کنم؟",
];

/**
 * `loggedIn`: /api/assistant فقط برای کاربران واردشده پاسخ می‌دهد؛ مهمان به‌جای گفت‌وگو دعوت به ورود می‌بیند.
 * `aiOff`: کلید هوش مصنوعی روی سرور تنظیم نشده (همان شرط صفحه‌های ایده/حمایت)؛ به‌جای گفت‌وگویی که
 * همیشه خطا می‌دهد فقط یک کارت توضیح و راه جایگزین (راهنمای بازی) نشان داده می‌شود.
 */
export function AskAgent({ loggedIn = true, aiOff = false }: { loggedIn?: boolean; aiOff?: boolean }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([GREETING]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const chat = loggedIn && !aiOff;

  // با باز شدن پنل فوکوس به ورودی (یا اگر ورودی نیست به دکمهٔ بستن) می‌رود و Escape پنل را می‌بندد و فوکوس را به دکمه برمی‌گرداند
  useEffect(() => {
    if (!open) return;
    (inputRef.current ?? closeRef.current)?.focus();
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
        // float-row (globals.css): ردیف پایین پشتهٔ شناور، بالای نوار پایین موبایل؛ گوشهٔ «انتها» (چپ در RTL)
        className="float-row print:hidden fixed end-4 z-50 size-14 rounded-full bg-brand-navy text-white shadow-lift flex items-center justify-center text-2xl hover:opacity-90 transition"
      >
        <span aria-hidden>{open ? "✕" : "🤖"}</span>
      </button>

      {open && (
        <div
          id="ask-agent-panel"
          role="dialog"
          aria-label="دستیار سؤال‌وجواب مسابقه"
          // float-above-row: بالای دکمهٔ دستیار و بنر اعلان فوری (هر کدام بلندتر است)، تا رویشان نیفتد
          className="float-above-row print:hidden fixed end-4 z-50 w-[92vw] max-w-sm card p-0 flex flex-col overflow-hidden shadow-lift"
          style={
            chat
              ? { height: "min(70vh, calc(100dvh - var(--bottom-nav-h, 0px) - max(var(--fab-size), var(--push-prompt-h)) - 6rem), 520px)" }
              : undefined
          }
        >
          <div className="flex items-start justify-between gap-2 px-4 py-3 border-b border-brand-mist bg-brand-ice">
            <div className="min-w-0">
              <div className="font-black text-brand-navy text-sm">دستیار سؤال‌وجواب مسابقه</div>
              <div className="text-xs text-brand-slate">پاسخ‌ها بر اساس قوانین رسمی بازی است.</div>
            </div>
            <button
              ref={closeRef}
              type="button"
              onClick={() => {
                setOpen(false);
                toggleRef.current?.focus();
              }}
              aria-label="بستن دستیار"
              className="shrink-0 size-11 -m-2 rounded-full flex items-center justify-center text-brand-slate hover:bg-brand-mist hover:text-brand-navy transition"
            >
              <span aria-hidden>✕</span>
            </button>
          </div>

          {aiOff ? (
            <div className="p-4 space-y-3">
              <div className="rounded-2xl border border-brand-mist bg-brand-ice px-4 py-3 text-sm leading-7 text-brand-navy">
                <span aria-hidden>🤖</span> دستیار هوش مصنوعی در این دوره فعال نیست. جواب بیشتر سؤال‌ها دربارهٔ قوانین،
                زمان‌بندی و جوایز در راهنمای بازی هست؛ بقیه را از برگزارکننده بپرس.
              </div>
              <Link href="/guide" onClick={() => setOpen(false)} className="btn-ghost w-full min-h-11">
                راهنمای بازی
              </Link>
            </div>
          ) : (
          <>
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
            {pending && <div className="text-xs text-brand-slate px-1">در حال نوشتن پاسخ…</div>}
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
              placeholder="سؤالت را بنویس…"
              maxLength={1000}
              disabled={pending}
              // بدون outline-none: حلقهٔ فوکوس پایه (--focus-ring) دیده می‌شود
              className="flex-1 min-w-0 rounded-pill border border-brand-mist bg-white px-3.5 py-2 text-sm text-brand-navy focus:border-brand-cyan-dark"
            />
            <button type="submit" disabled={pending || !input.trim()} className="btn-primary !py-2 !px-4 !text-sm disabled:opacity-50">
              ارسال
            </button>
          </form>
          )}
          </>
          )}
        </div>
      )}
    </>
  );
}
