"use client";

import { useActionState } from "react";
import { STAFF_ROLES, STAFF_ROLE_LABEL } from "@/lib/panel-roles";
import { setStaffRoleAction, type StaffActionState } from "./actions";

export function StaffRoleForm({ userId, nickname, current }: { userId: string; nickname: string; current: string }) {
  const [state, formAction, pending] = useActionState<StaffActionState, FormData>(setStaffRoleAction, {});
  const id = `staff-${userId}`;
  return (
    <form key={current} action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="userId" value={userId} />
      <label htmlFor={id} className="sr-only">نقش {nickname}</label>
      <select id={id} name="staffRole" defaultValue={current} className="input !py-2 !px-3 !text-sm !w-auto min-h-10">
        <option value="">بدون نقش</option>
        {STAFF_ROLES.map((r) => (
          <option key={r} value={r}>{STAFF_ROLE_LABEL[r]}</option>
        ))}
      </select>
      <button type="submit" disabled={pending} className="btn-ghost !py-2 !px-4 text-sm min-h-10">
        {pending ? "…" : "ذخیره"}
      </button>
      {state.error && <span className="text-xs text-brand-red" role="alert">{state.error}</span>}
      {state.ok && !pending && <span className="text-emerald-600 text-xs font-bold" role="status">ذخیره شد</span>}
    </form>
  );
}
