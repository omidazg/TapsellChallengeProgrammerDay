"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { Avatar } from "@/components/Avatar";
import { jdatetime } from "@/lib/persian";
import { Alert } from "@/components/ui";
import { AiUnavailable } from "@/components/AiUnavailable";
import { dueDiligenceAction, type ChatActionState } from "../actions";

type ChatRow = { id: string; userId: string; nickname: string; avatarSeed: string; question: string; answer: string; createdAt: Date };

function AskButton({ disabled = false }: { disabled?: boolean }) {
  const status = useFormStatus();
  return (
    <button type="submit" disabled={disabled || status.pending} className="btn-cyan w-full sm:w-auto shrink-0 disabled:opacity-50">
      {status.pending ? "در حال پرسیدن…" : "پرسیدن"}
    </button>
  );
}

export function DueDiligenceChat({ ideaId, chats, aiOff = false }: { ideaId: string; chats: ChatRow[]; aiOff?: boolean }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState<ChatActionState, FormData>(dueDiligenceAction, {});

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  return (
    <div className="card p-6 anim-rise">
      <h3 className="font-black text-brand-navy mb-4">چت بررسی دقیق</h3>

      {aiOff && <div className="mb-4"><AiUnavailable /></div>}
      {state.aiUnavailable && <Alert kind="info">تحلیل‌گر هوش مصنوعی در دسترس نیست.</Alert>}
      {state.error && <Alert kind="error">{state.error}</Alert>}

      {chats.length === 0 ? (
        <p className="mb-4 text-sm text-brand-slate">هنوز سؤالی پرسیده نشده است.</p>
      ) : (
        <ul className="mb-4 max-h-80 space-y-4 overflow-y-auto rounded-2xl border border-brand-mist p-3">
          {chats.map((c) => (
            <li key={c.id} className="space-y-2">
              <div className="flex items-center gap-2">
                <Avatar seed={c.avatarSeed || c.userId} size={24} />
                <span className="text-xs font-bold text-brand-slate">{c.nickname}</span>
                <span className="text-xs text-brand-slate/70">{jdatetime(c.createdAt)}</span>
              </div>
              <p className="text-sm font-bold text-brand-navy break-words">{c.question}</p>
              <p className="text-sm text-brand-slate bg-brand-ice rounded-2xl p-3 break-words">{c.answer}</p>
            </li>
          ))}
        </ul>
      )}

      <form ref={formRef} action={formAction} className="flex flex-col sm:flex-row gap-2">
        <input type="hidden" name="ideaId" value={ideaId} />
        <input
          name="question"
          aria-label="سؤال دربارهٔ این ایده"
          required
          minLength={3}
          maxLength={300}
          disabled={aiOff}
          className="input flex-1 disabled:opacity-50"
          placeholder="سؤالت را از متن ایده بپرس…"
        />
        <AskButton disabled={aiOff} />
      </form>
    </div>
  );
}
