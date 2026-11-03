"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useConfirm } from "@/components/ConfirmDialog";
import { deletePostAction, reportPostAction } from "./actions";

/** گزارش پست (کاربر واردشده) و حذف آن (اعضای همان تیم) */
export function PostActions({ postId, canDelete, canReport }: { postId: string; canDelete: boolean; canReport: boolean }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canReport && (
        <button
          type="button"
          disabled={pending}
          className="btn-ghost !py-2 !px-4 text-sm"
          onClick={() => {
            const reason = window.prompt("چرا این پست مناسب نیست؟ (اختیاری)") ?? null;
            if (reason === null) return;
            startTransition(async () => {
              const res = await reportPostAction(postId, reason);
              setMessage(res.error ?? "گزارش شما ثبت شد؛ برگزارکننده بررسی می‌کند.");
            });
          }}
        >
          🚩 گزارش
        </button>
      )}
      {canDelete && (
        <button
          type="button"
          disabled={pending}
          className="btn-ghost !py-2 !px-4 text-sm !text-brand-red"
          onClick={async () => {
            if (!(await confirm({ title: "این پست حذف شود؟", confirmLabel: "حذف", destructive: true }))) return;
            startTransition(async () => {
              const res = await deletePostAction(postId);
              if (res.error) setMessage(res.error);
              else router.push("/board");
            });
          }}
        >
          حذف پست
        </button>
      )}
      {message && <span className="text-xs text-brand-slate" role="status">{message}</span>}
    </div>
  );
}
