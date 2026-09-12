"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui";
import { jdatetime } from "@/lib/persian";
import { toggleAnnouncementAction, deleteAnnouncementAction, type AnnouncementActionState } from "./actions";

const LEVEL_CHIP: Record<string, string> = { info: "chip-cyan", warning: "chip-gold", danger: "chip-red" };
const LEVEL_LABEL: Record<string, string> = { info: "اطلاع‌رسانی", warning: "هشدار", danger: "خطر" };

export type AnnouncementRowData = {
  id: string;
  text: string;
  level: string;
  active: boolean;
  createdAt: string;
};

export function AnnouncementRow({ announcement }: { announcement: AnnouncementRowData }) {
  const [toggleState, toggleAction] = useActionState<AnnouncementActionState, FormData>(toggleAnnouncementAction, {});
  const [deleteState, deleteAction] = useActionState<AnnouncementActionState, FormData>(deleteAnnouncementAction, {});

  return (
    <div className="card p-4 sm:p-5 flex flex-wrap items-center gap-3 anim-rise">
      <span className={`chip ${LEVEL_CHIP[announcement.level] ?? "chip-cyan"}`}>{LEVEL_LABEL[announcement.level] ?? announcement.level}</span>
      <div className="flex-1 min-w-[180px] break-words">
        <div className="font-bold text-brand-navy break-words">{announcement.text}</div>
        <div className="text-xs text-brand-slate">{jdatetime(new Date(announcement.createdAt))}</div>
      </div>

      <form action={toggleAction}>
        <input type="hidden" name="id" value={announcement.id} />
        <input type="hidden" name="active" value={announcement.active ? "0" : "1"} />
        <button type="submit" className={`chip ${announcement.active ? "chip-ok" : "chip-navy"}`}>
          {announcement.active ? "فعال" : "غیرفعال"}
        </button>
      </form>

      <form action={deleteAction}>
        <input type="hidden" name="id" value={announcement.id} />
        <button type="submit" className="btn-ghost !py-1.5 !px-3 text-xs !text-brand-red !border-red-100 hover:!bg-red-50">
          حذف
        </button>
      </form>

      {toggleState.error && <Alert kind="error">{toggleState.error}</Alert>}
      {deleteState.error && <Alert kind="error">{deleteState.error}</Alert>}
    </div>
  );
}
