"use client";

import { useActionState } from "react";
import { Avatar } from "@/components/Avatar";
import { fa, coins, jdatetime } from "@/lib/persian";
import { Alert } from "@/components/ui";
import { insiderRevealAction, type InvestActionState } from "../actions";

type InvestorRow = { id: string; userId: string; nickname: string; avatarSeed: string; amount: number; createdAt: Date };

export function InvestorList({
  ideaId,
  investments,
  revealed,
  canReveal,
}: {
  ideaId: string;
  investments: InvestorRow[];
  revealed: boolean;
  canReveal: boolean;
}) {
  const [state, formAction] = useActionState<InvestActionState, FormData>(insiderRevealAction, {});

  return (
    <div className="card p-6 anim-rise">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h3 className="font-black text-brand-navy">سرمایه‌گذاران ({fa(investments.length)})</h3>
        {!revealed && canReveal && (
          <form action={formAction}>
            <input type="hidden" name="ideaId" value={ideaId} />
            <button type="submit" className="chip-cyan hover:bg-brand-mist">🕵️ استفاده از قدرت خبرچین</button>
          </form>
        )}
      </div>
      {state.error && <Alert kind="error">{state.error}</Alert>}
      {investments.length === 0 ? (
        <p className="text-sm text-brand-slate">هنوز کسی سرمایه‌گذاری نکرده است.</p>
      ) : (
        <ul className="space-y-3">
          {investments.map((inv) => (
            <li key={inv.id} className="flex items-center gap-3">
              <Avatar seed={inv.avatarSeed || inv.userId} size={32} />
              <div className="flex-1 min-w-0">
                <div className="font-bold text-brand-navy truncate">{inv.nickname}</div>
                <div className="text-xs text-brand-slate">{jdatetime(inv.createdAt)}</div>
              </div>
              <span className="font-black text-brand-navy fa-num shrink-0">{revealed ? coins(inv.amount) : "پنهان"}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
