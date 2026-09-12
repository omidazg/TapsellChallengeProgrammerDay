"use client";

import { useActionState, useRef } from "react";
import { useFormStatus } from "react-dom";
import { Avatar } from "@/components/Avatar";
import { jdatetime } from "@/lib/persian";
import { Alert } from "@/components/ui";
import { dueDiligenceAction, type ChatActionState } from "../actions";

type ChatRow = { id: string; userId: string; nickname: string; avatarSeed: string; question: string; answer: string; createdAt: Date };

function AskButton() {
  const status = useFormStatus();
  return (
    <button type="submit" disabled={status.pending} className="btn-cyan shrink-0">
      {status.pending ? "در حال پرسیدن…" : "پرسیدن"}
    </button>
  );
}

export function DueDiligenceChat({ ideaId, chats }: { ideaId: string; chats: ChatRow[] }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState<ChatActionState, FormData>(async (_prev, formData) => {
    const question = String(formData.get("question") ?? "");
    const res = await dueDiligenceAction(ideaId, question);
    if (res.ok) formRef.current?.reset();
    return res;
  }, {});

  return (
    <div className="card p-6 anim-rise">
      <h3 className="font-black text-brand-navy mb-4">چت بررسی دقیق</h3>

      {state.aiUnavailable && <Alert kind="info">تحلیل‌گر هوش مصنوعی در دسترس نیست.</Alert>}
      {state.error && <Alert kind="error">{state.error}</Alert>}

      <form ref={formRef} action={formAction} className="flex gap-2 mb-5">
        <input name="question" required maxLength={300} className="input flex-1" placeholder="سؤالت را از متن ایده بپرس…" />
        <AskButton />
      </form>

      {chats.length === 0 ? (
        <p className="text-sm text-brand-slate">هنوز سؤالی پرسیده نشده است.</p>
      ) : (
        <ul className="space-y-4">
          {chats.map((c) => (
            <li key={c.id} className="space-y-2">
              <div className="flex items-center gap-2">
                <Avatar seed={c.avatarSeed || c.userId} size={24} />
                <span className="text-xs font-bold text-brand-slate">{c.nickname}</span>
                <span className="text-xs text-brand-slate/70">{jdatetime(c.createdAt)}</span>
              </div>
              <p className="text-sm font-bold text-brand-navy">{c.question}</p>
              <p className="text-sm text-brand-slate bg-brand-ice rounded-2xl p-3">{c.answer}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
