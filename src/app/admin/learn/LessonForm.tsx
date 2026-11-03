"use client";

import { startTransition, useActionState, useEffect, useRef } from "react";
import { Alert } from "@/components/ui";
import { useConfirmSubmit } from "@/components/ConfirmDialog";
import { deleteLessonAction, saveLessonAction, type LessonActionState } from "./actions";

export type LessonData = {
  id: string;
  title: string;
  instructor: string;
  description: string;
  videoUrl: string;
  links: string;
  order: number;
  published: boolean;
};

export function LessonForm({ lesson, nextOrder = 0 }: { lesson?: LessonData; nextOrder?: number }) {
  const [state, formAction, pending] = useActionState<LessonActionState, FormData>(saveLessonAction, {});
  const [deleteState, deleteAction, deleting] = useActionState<LessonActionState, FormData>(deleteLessonAction, {});
  const confirmSubmit = useConfirmSubmit();
  const formRef = useRef<HTMLFormElement>(null);
  const idp = `lesson-${lesson?.id ?? "new"}`;

  // فرم درس تازه پس از ذخیرهٔ موفق خالی می‌شود.
  useEffect(() => {
    if (state.ok && !lesson) formRef.current?.reset();
  }, [state, lesson]);

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
        {lesson && <input type="hidden" name="id" value={lesson.id} />}
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_6rem]">
          <div>
            <label className="label" htmlFor={`${idp}-title`}>عنوان</label>
            <input id={`${idp}-title`} name="title" required maxLength={200} defaultValue={lesson?.title ?? ""} className="input !py-2 !px-3 w-full" />
          </div>
          <div>
            <label className="label" htmlFor={`${idp}-instructor`}>مدرس</label>
            <input id={`${idp}-instructor`} name="instructor" maxLength={100} defaultValue={lesson?.instructor ?? ""} className="input !py-2 !px-3 w-full" />
          </div>
          <div>
            <label className="label" htmlFor={`${idp}-order`}>ترتیب</label>
            <input id={`${idp}-order`} name="order" type="number" min={0} max={999} defaultValue={lesson?.order ?? nextOrder} className="input fa-num !py-2 !px-3 w-full" />
          </div>
        </div>
        <div>
          <label className="label" htmlFor={`${idp}-video`}>لینک ویدیو (ترجیحاً آپارات)</label>
          <input id={`${idp}-video`} name="videoUrl" type="url" dir="ltr" maxLength={400} defaultValue={lesson?.videoUrl ?? ""} placeholder="https://www.aparat.com/v/…" className="input !py-2 !px-3 w-full" />
        </div>
        <div>
          <label className="label" htmlFor={`${idp}-desc`}>توضیح</label>
          <textarea id={`${idp}-desc`} name="description" rows={3} maxLength={4000} defaultValue={lesson?.description ?? ""} className="input w-full" />
        </div>
        <div>
          <label className="label" htmlFor={`${idp}-links`}>ابزارها و لینک‌ها (هر خط یک لینک)</label>
          <textarea id={`${idp}-links`} name="links" rows={2} dir="ltr" maxLength={4000} defaultValue={lesson?.links ?? ""} className="input w-full" />
        </div>
        <label className="flex items-center gap-2 cursor-pointer text-sm font-bold text-brand-navy min-h-8">
          <input type="checkbox" name="published" value="1" defaultChecked={lesson?.published ?? true} className="h-4 w-4 accent-brand-red" />
          منتشرشده (در صفحهٔ آموزش دیده می‌شود)
        </label>
        {state.error && <Alert kind="error">{state.error}</Alert>}
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={pending} className={lesson ? "btn-ghost !py-2 !px-4 text-sm min-h-10" : "btn-primary !py-2 !px-4 text-sm min-h-10"}>
            {pending ? "…" : lesson ? "ذخیره" : "افزودن درس"}
          </button>
          {state.ok && !pending && <span className="text-emerald-600 text-xs font-bold" role="status">ذخیره شد</span>}
        </div>
      </form>
      {lesson && (
        <form
          action={deleteAction}
          onSubmit={(e) => confirmSubmit(e, { title: `درس «${lesson.title}» حذف شود؟`, confirmLabel: "حذف", destructive: true })}
        >
          <input type="hidden" name="id" value={lesson.id} />
          <button type="submit" disabled={deleting} className="btn-ghost !py-2 !px-4 text-sm min-h-10 !text-brand-red">
            {deleting ? "…" : "حذف درس"}
          </button>
          {deleteState.error && <Alert kind="error">{deleteState.error}</Alert>}
        </form>
      )}
    </div>
  );
}
