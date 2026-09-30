"use client";

import { useActionState, useState } from "react";
import { Alert } from "@/components/ui";
import { Avatar } from "@/components/Avatar";
import { coins } from "@/lib/persian";
import { copyText } from "@/lib/clipboard";
import {
  toggleAdminAction,
  adjustWalletAction,
  resetPasswordAction,
  toggleBlockAction,
  setUserPhoneAction,
  type UsersActionState,
  type ResetPasswordState,
} from "./actions";

export type UserRowData = {
  id: string;
  email: string;
  phone: string | null;
  nickname: string;
  avatarSeed: string;
  isAdmin: boolean;
  blocked: boolean;
  teamName: string | null;
  seedWallet: number;
  buyWallet: number;
};

export function UserRow({ user, isMe }: { user: UserRowData; isMe: boolean }) {
  const [toggleState, toggleAction] = useActionState<UsersActionState, FormData>(toggleAdminAction, {});
  const [adjustState, adjustAction] = useActionState<UsersActionState, FormData>(adjustWalletAction, {});
  const [resetState, resetAction] = useActionState<ResetPasswordState, FormData>(resetPasswordAction, {});
  const [blockState, blockAction] = useActionState<UsersActionState, FormData>(toggleBlockAction, {});
  const [phoneState, phoneAction, phonePending] = useActionState<UsersActionState, FormData>(setUserPhoneAction, {});
  const [copied, setCopied] = useState(false);

  const canBlock = !isMe && !user.isAdmin;

  async function copyPassword(pw: string) {
    if (await copyText(pw)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
    /* در غیر این صورت کاربر می‌تواند رمز را دستی کپی کند */
  }

  return (
    <div className="card p-4 sm:p-6 flex flex-wrap items-center gap-4 anim-rise">
      <Avatar seed={user.avatarSeed || user.id} size={36} />
      <div className="min-w-[160px] max-w-full break-words">
        <div className="font-bold text-brand-navy break-words flex items-center gap-2">
          {user.nickname}
          {user.blocked && <span className="chip chip-red !py-0.5 !px-2 text-[10px]">مسدود</span>}
        </div>
        <div className="text-xs text-brand-slate break-words">{user.email}</div>
        {user.phone && <div className="text-xs text-brand-slate" dir="ltr">{user.phone}</div>}
        <div className="text-xs text-brand-slate break-words">{user.teamName ?? "بدون تیم"}</div>
      </div>
      <div className="text-xs text-brand-navy flex flex-wrap gap-3">
        <span>🌱 {coins(user.seedWallet)}</span>
        <span>🛒 {coins(user.buyWallet)}</span>
      </div>

      <form
        action={toggleAction}
        onSubmit={(e) => {
          if (!confirm(`دسترسی برگزارکنندگی ${user.nickname} تغییر کند؟`)) e.preventDefault();
        }}
      >
        <input type="hidden" name="userId" value={user.id} />
        <button
          type="submit"
          disabled={isMe}
          aria-label={`تغییر دسترسی برگزارکنندگی برای ${user.nickname}`}
          className={`chip ${user.isAdmin ? "chip-red" : "chip-navy"}`}
        >
          {user.isAdmin ? "برگزارکننده" : "کاربر عادی"}
        </button>
      </form>

      <form
        action={adjustAction}
        className="flex flex-wrap items-center gap-1.5"
        onSubmit={(e) => {
          const fd = new FormData(e.currentTarget);
          const amount = Number(fd.get("amount"));
          const walletLabel = fd.get("wallet") === "SEED" ? "کیف بذر" : "کیف خرید";
          if (!Number.isFinite(amount) || amount === 0) return; // خطای اعتبارسنجی را سرور نشان می‌دهد
          const verb = amount > 0 ? `${coins(amount)} به ${walletLabel}` : `${coins(-amount)} از ${walletLabel}`;
          if (!confirm(`${verb} ${user.nickname} ${amount > 0 ? "افزوده" : "کسر"} شود؟ این تغییر در دفتر کل ثبت می‌شود.`)) e.preventDefault();
        }}
      >
        <input type="hidden" name="userId" value={user.id} />
        <label htmlFor={`wallet-${user.id}`} className="sr-only">نوع کیف برای {user.nickname}</label>
        <select id={`wallet-${user.id}`} name="wallet" className="input !py-1 !px-2 w-auto text-xs">
          <option value="SEED">بذر</option>
          <option value="BUY">خرید</option>
        </select>
        <label htmlFor={`amount-${user.id}`} className="sr-only">مبلغ سکه برای {user.nickname}</label>
        <input id={`amount-${user.id}`} name="amount" type="number" step={1} required defaultValue={10} className="input !py-1 !px-2 w-20 text-xs" />
        <button type="submit" className="btn-ghost !py-1 !px-3 text-xs" title="برای کسر، عدد منفی وارد کن">افزودن/کسر سکه</button>
      </form>

      <form
        action={resetAction}
        onSubmit={(e) => {
          if (!confirm(`رمز عبور ${user.nickname} بازنشانی شود؟ نشست‌های فعلی او باطل می‌شود.`)) e.preventDefault();
        }}
      >
        <input type="hidden" name="userId" value={user.id} />
        <button type="submit" aria-label={`بازنشانی رمز عبور ${user.nickname}`} className="btn-ghost !py-1 !px-3 text-xs">
          بازنشانی رمز
        </button>
      </form>

      {canBlock && (
        <form
          action={blockAction}
          onSubmit={(e) => {
            const verb = user.blocked ? "رفع مسدودیت" : "مسدودسازی";
            if (!confirm(`${verb} ${user.nickname} انجام شود؟`)) e.preventDefault();
          }}
        >
          <input type="hidden" name="userId" value={user.id} />
          <button
            type="submit"
            aria-label={`${user.blocked ? "رفع مسدودیت" : "مسدودسازی"} ${user.nickname}`}
            className={`chip ${user.blocked ? "chip-navy" : "chip-red"}`}
          >
            {user.blocked ? "رفع مسدودیت" : "مسدودسازی"}
          </button>
        </form>
      )}

      <form action={phoneAction} className="flex items-center gap-1.5">
        <input type="hidden" name="userId" value={user.id} />
        <label htmlFor={`phone-${user.id}`} className="sr-only">شمارهٔ موبایل {user.nickname}</label>
        <input
          id={`phone-${user.id}`}
          name="phone"
          type="tel"
          dir="ltr"
          maxLength={20}
          defaultValue={user.phone ?? ""}
          placeholder="09xxxxxxxxx"
          className="input !py-1 !px-2 w-32 text-xs"
        />
        <button type="submit" disabled={phonePending} className="btn-ghost !py-1 !px-3 text-xs" aria-label={`ثبت شمارهٔ موبایل ${user.nickname}`}>
          ثبت موبایل
        </button>
      </form>

      {toggleState.error && <Alert kind="error">{toggleState.error}</Alert>}
      {phoneState.error && <Alert kind="error">{phoneState.error}</Alert>}
      {phoneState.ok && <span className="text-emerald-600 text-xs font-bold">شماره ذخیره شد</span>}
      {adjustState.error && <Alert kind="error">{adjustState.error}</Alert>}
      {adjustState.ok && <span className="text-emerald-600 text-xs font-bold">انجام شد</span>}
      {blockState.error && <Alert kind="error">{blockState.error}</Alert>}
      {resetState.error && <Alert kind="error">{resetState.error}</Alert>}
      {resetState.password && (
        <div className="w-full flex flex-wrap items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs">
          <span className="font-bold text-brand-navy">رمز تازه (فقط یک‌بار نمایش داده می‌شود):</span>
          <code dir="ltr" className="font-mono">{resetState.password}</code>
          <button
            type="button"
            onClick={() => copyPassword(resetState.password!)}
            className="btn-ghost !py-0.5 !px-2 text-xs"
            aria-label="کپی رمز تازه"
          >
            {copied ? "کپی شد" : "کپی"}
          </button>
        </div>
      )}
    </div>
  );
}
