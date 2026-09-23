"use client";

import { useRef, useState } from "react";

type ChatMsg = { role: "user" | "assistant"; content: string };

const GREETING: ChatMsg = {
  role: "assistant",
  content: "سلام! من دستیار سؤال‌وجواب میدان بنیان‌گذاران تپسل‌ام. هر سؤالی دربارهٔ قوانین، زمان‌بندی یا جوایز مسابقه داری بپرس.",
};

export function AskAgent() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([GREETING]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  async function send() {
    const text = input.trim();
    if (!text || pending) return;
    setError(null);
    const next = [...messages, { role: "user", content: text } as ChatMsg];
    setMessages(next);
    setInput("");
    setPending(true);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.slice(-12) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "خطایی رخ داد.");
        return;
      }
      setMessages((m) => [...m, { role: "assistant", content: data.reply }]);
      queueMicrotask(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }));
    } catch {
      setError("ارتباط برقرار نشد؛ دوباره تلاش کن.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={open ? "بستن دستیار هوش مصنوعی" : "باز کردن دستیار هوش مصنوعی"}
        className="fixed bottom-4 left-4 z-50 size-14 rounded-full bg-brand-navy text-white shadow-lift flex items-center justify-center text-2xl hover:opacity-90 transition"
      >
        <span aria-hidden>{open ? "✕" : "🤖"}</span>
      </button>

      {open && (
        <div className="fixed bottom-20 left-4 z-50 w-[92vw] max-w-sm card p-0 flex flex-col overflow-hidden shadow-lift" style={{ height: "min(70vh, 520px)" }}>
          <div className="px-4 py-3 border-b border-brand-mist bg-brand-ice">
            <div className="font-black text-brand-navy text-sm">دستیار سؤال‌وجواب مسابقه</div>
            <div className="text-xs text-brand-slate">پاسخ‌ها بر اساس قوانین رسمی بازی است.</div>
          </div>

          <div ref={listRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
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
            {pending && <div className="text-xs text-brand-slate px-1">در حال نوشتن پاسخ...</div>}
            {error && <div className="text-xs text-brand-red px-1">{error}</div>}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            className="border-t border-brand-mist p-2 flex items-center gap-2"
          >
            <input
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
        </div>
      )}
    </>
  );
}
