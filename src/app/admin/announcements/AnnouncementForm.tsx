"use client";

import { useActionState, useRef, useEffect } from "react";
import { Alert } from "@/components/ui";
import { createAnnouncementAction, type AnnouncementActionState } from "./actions";

export function AnnouncementForm() {
  const [state, formAction, pending] = useActionState<AnnouncementActionState, FormData>(createAnnouncementAction, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  return (
    <form ref={formRef} action={formAction} className="card p-4 sm:p-6 space-y-3 anim-rise">
      <h3 className="font-black text-brand-navy">اطلاعیهٔ جدید</h3>
      <textarea name="text" required rows={2} className="input w-full" placeholder="متن اطلاعیه…" />
      <div className="flex flex-wrap items-center gap-3">
        <select name="level" defaultValue="info" className="input w-auto">
          <option value="info">اطلاع‌رسانی</option>
          <option value="warning">هشدار</option>
          <option value="danger">خطر</option>
        </select>
        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? "در حال ثبت…" : "انتشار"}
        </button>
      </div>
      {state.error && <Alert kind="error">{state.error}</Alert>}
      {state.ok && <Alert kind="ok">اطلاعیه منتشر شد.</Alert>}
    </form>
  );
}
