"use client";

import { startTransition, useActionState, useEffect, useRef } from "react";
import { Alert } from "@/components/ui";
import { useConfirmSubmit } from "@/components/ConfirmDialog";
import { fa } from "@/lib/persian";
import { deleteOsIssueAction, saveOsIssueAction, type OsIssueActionState } from "./actions";

export type OsIssueData = { id: string; title: string; description: string; url: string; active: boolean; productCount: number };

export function OsIssueForm({ issue }: { issue?: OsIssueData }) {
  const [state, formAction, pending] = useActionState<OsIssueActionState, FormData>(saveOsIssueAction, {});
  const [deleteState, deleteAction, deleting] = useActionState<OsIssueActionState, FormData>(deleteOsIssueAction, {});
  const confirmSubmit = useConfirmSubmit();
  const formRef = useRef<HTMLFormElement>(null);
  const idp = `issue-${issue?.id ?? "new"}`;

  // فرم ایشوی تازه پس از ذخیرهٔ موفق خالی می‌شود.
  useEffect(() => {
    if (state.ok && !issue) formRef.current?.reset();
  }, [state, issue]);

  return (
    <div className="card p-4 sm:p-6 space-y-3 anim-rise">
      <form
        ref={formRef}
        // ارسال دستی: ری‌ست خودکار فرم (React 19) ورودی‌ها را پس از خطای اعتبارسنجی پاک می‌کرد.
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          startTransition(() => formAction(data));
        }}
        className="space-y-3"
      >
        {issue && <input type="hidden" name="id" value={issue.id} />}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor={`${idp}-title`}>عنوان</label>
            <input id={`${idp}-title`} name="title" required maxLength={200} defaultValue={issue?.title ?? ""} className="input !py-2 !px-3 w-full" />
          </div>
          <div>
            <label className="label" htmlFor={`${idp}-url`}>لینک ایشو</label>
            <input id={`${idp}-url`} name="url" type="url" dir="ltr" maxLength={400} defaultValue={issue?.url ?? ""} placeholder="https://" className="input !py-2 !px-3 w-full" />
          </div>
        </div>
        <div>
          <label className="label" htmlFor={`${idp}-desc`}>توضیح</label>
          <textarea id={`${idp}-desc`} name="description" rows={2} maxLength={2000} defaultValue={issue?.description ?? ""} className="input w-full" />
        </div>
        <label className="flex items-center gap-2 cursor-pointer text-sm font-bold text-brand-navy min-h-8">
          <input type="checkbox" name="active" value="1" defaultChecked={issue?.active ?? true} className="h-4 w-4 accent-brand-red" />
          فعال (تیم‌ها می‌توانند انتخابش کنند)
        </label>
        {issue && issue.productCount > 0 && <p className="text-xs text-brand-slate">{fa(issue.productCount)} تیم این ایشو را برداشته‌اند.</p>}
        {state.error && <Alert kind="error">{state.error}</Alert>}
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={pending} className={issue ? "btn-ghost !py-2 !px-4 text-sm min-h-10" : "btn-primary !py-2 !px-4 text-sm min-h-10"}>
            {pending ? "…" : issue ? "ذخیره" : "افزودن ایشو"}
          </button>
          {state.ok && !pending && <span className="text-emerald-600 text-xs font-bold" role="status">ذخیره شد</span>}
        </div>
      </form>
      {issue && (
        <form
          action={deleteAction}
          onSubmit={(e) => confirmSubmit(e, { title: `ایشوی «${issue.title}» حذف شود؟`, confirmLabel: "حذف", destructive: true })}
        >
          <input type="hidden" name="id" value={issue.id} />
          <button type="submit" disabled={deleting} className="btn-ghost !py-2 !px-4 text-sm min-h-10 !text-brand-red">
            {deleting ? "…" : "حذف ایشو"}
          </button>
          {deleteState.error && <Alert kind="error">{deleteState.error}</Alert>}
        </form>
      )}
    </div>
  );
}
