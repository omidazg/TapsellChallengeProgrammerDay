"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui";
import { Avatar } from "@/components/Avatar";
import { coins } from "@/lib/persian";
import { toggleAdminAction, adjustWalletAction, type UsersActionState } from "./actions";

export type UserRowData = {
  id: string;
  email: string;
  nickname: string;
  avatarSeed: string;
  isAdmin: boolean;
  teamName: string | null;
  seedWallet: number;
  buyWallet: number;
};

export function UserRow({ user, isMe }: { user: UserRowData; isMe: boolean }) {
  const [toggleState, toggleAction] = useActionState<UsersActionState, FormData>(toggleAdminAction, {});
  const [adjustState, adjustAction] = useActionState<UsersActionState, FormData>(adjustWalletAction, {});

  return (
    <div className="card p-4 sm:p-6 flex flex-wrap items-center gap-4 anim-rise">
      <Avatar seed={user.avatarSeed || user.id} size={36} />
      <div className="min-w-[160px] max-w-full break-words">
        <div className="font-bold text-brand-navy break-words">{user.nickname}</div>
        <div className="text-xs text-brand-slate break-words">{user.email}</div>
        <div className="text-xs text-brand-slate break-words">{user.teamName ?? "بدون تیم"}</div>
      </div>
      <div className="text-xs text-brand-navy flex flex-wrap gap-3">
        <span>🌱 {coins(user.seedWallet)}</span>
        <span>🛒 {coins(user.buyWallet)}</span>
      </div>

      <form action={toggleAction}>
        <input type="hidden" name="userId" value={user.id} />
        <button type="submit" disabled={isMe} className={`chip ${user.isAdmin ? "chip-red" : "chip-navy"}`}>
          {user.isAdmin ? "برگزارکننده" : "کاربر عادی"}
        </button>
      </form>

      <form action={adjustAction} className="flex flex-wrap items-center gap-1.5">
        <input type="hidden" name="userId" value={user.id} />
        <label htmlFor={`wallet-${user.id}`} className="sr-only">نوع کیف برای {user.nickname}</label>
        <select id={`wallet-${user.id}`} name="wallet" className="input !py-1 !px-2 w-auto text-xs">
          <option value="SEED">بذر</option>
          <option value="BUY">خرید</option>
        </select>
        <label htmlFor={`amount-${user.id}`} className="sr-only">مبلغ سکه برای {user.nickname}</label>
        <input id={`amount-${user.id}`} name="amount" type="number" defaultValue={10} className="input !py-1 !px-2 w-20 text-xs" />
        <button type="submit" className="btn-ghost !py-1 !px-3 text-xs">افزودن سکه</button>
      </form>

      {toggleState.error && <Alert kind="error">{toggleState.error}</Alert>}
      {adjustState.error && <Alert kind="error">{adjustState.error}</Alert>}
      {adjustState.ok && <span className="text-emerald-600 text-xs font-bold">انجام شد</span>}
    </div>
  );
}
