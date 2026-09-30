"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { Alert } from "@/components/ui";
import { fa, coins, jtime, toEnDigits } from "@/lib/persian";
import { bidOnSlotAction } from "./actions";
import { AD_SLOT_KINDS } from "@/lib/constants";
import type { SlotCell } from "@/lib/adslots";

type Kind = keyof typeof AD_SLOT_KINDS;
const KINDS = Object.keys(AD_SLOT_KINDS) as Kind[];

export function SlotGrid({
  cells,
  myTeamId,
  treasury,
  canBid = true,
}: {
  cells: SlotCell[];
  myTeamId: string | null;
  treasury: number;
  /** فقط سرپرست تیم پیشنهاد می‌دهد؛ بقیهٔ اعضا پیشنهاد تیم را فقط می‌بینند */
  canBid?: boolean;
}) {
  const hours = Array.from(new Set(cells.map((c) => c.hourStart))).sort();
  const byKey = new Map(cells.map((c) => [`${c.kind}|${c.hourStart}`, c]));
  const router = useRouter();

  const committedOpen = cells.filter((c) => c.status === "OPEN" && c.myBid !== null).reduce((s, c) => s + (c.myBid ?? 0), 0);

  const renderCell = (cell: SlotCell) => (
    // کلید شامل وضعیت و پیشنهاد من است تا پس از refresh مقدار ورودی کهنه نماند.
    <Cell key={`${cell.id}|${cell.status}|${cell.myBid ?? ""}`} cell={cell} myTeamId={myTeamId} canBid={canBid} onDone={() => router.refresh()} />
  );

  return (
    <div>
      {myTeamId && (
        <div className="mb-3 text-xs text-brand-slate">
          خزانهٔ تیم: <b className="fa-num text-brand-navy">{coins(treasury)}</b> · تعهد باز فعلی:{" "}
          <b className="fa-num text-brand-navy">{coins(committedOpen)}</b>
        </div>
      )}
      {/* زیر sm: هر ساعت یک کارت عمودی با جایگاه‌هایش (جدول ۵۶۰پیکسلی روی گوشی اسکرول افقی می‌خورد). */}
      <div className="space-y-3 sm:hidden">
        {hours.map((h) => (
          <section key={h} className="rounded-2xl border border-brand-mist bg-brand-ice p-3">
            <h3 className="fa-num font-black text-brand-navy mb-2">{jtime(new Date(h))}</h3>
            <ul className="space-y-2">
              {KINDS.map((k) => {
                const cell = byKey.get(`${k}|${h}`);
                return (
                  <li key={k}>
                    <div className="mb-1 text-xs font-bold text-brand-slate">
                      <span aria-hidden>{AD_SLOT_KINDS[k].emoji}</span> {AD_SLOT_KINDS[k].label}
                    </div>
                    {cell ? renderCell(cell) : <span className="text-brand-slate text-xs">—</span>}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full min-w-[560px] border-separate border-spacing-2">
          <caption className="sr-only">جایگاه‌های تبلیغاتی به تفکیک ساعت و نوع</caption>
          <thead>
            <tr>
              <th scope="col" className="text-right text-xs font-bold text-brand-slate">ساعت</th>
              {KINDS.map((k) => (
                <th key={k} scope="col" className="text-right text-xs font-bold text-brand-slate">
                  <span aria-hidden>{AD_SLOT_KINDS[k].emoji}</span> {AD_SLOT_KINDS[k].label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {hours.map((h) => (
              <tr key={h}>
                <td className="fa-num font-black text-brand-navy align-top py-2">{jtime(new Date(h))}</td>
                {KINDS.map((k) => {
                  const cell = byKey.get(`${k}|${h}`);
                  return (
                    <td key={k} className="align-top">
                      {cell ? renderCell(cell) : <span className="text-brand-slate text-xs">—</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Cell({
  cell,
  myTeamId,
  canBid,
  onDone,
}: {
  cell: SlotCell;
  myTeamId: string | null;
  canBid: boolean;
  onDone: () => void;
}) {
  // متن خام (رقم فارسی هم قبول است)؛ input عددی رقم فارسی را رد می‌کند.
  const [raw, setRaw] = useState(String(cell.myBid ?? 1));
  const digits = toEnDigits(raw.trim());
  const value = /^\d+$/.test(digits) ? Number(digits) : 0;
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (cell.status === "CLOSED") {
    return (
      <div className="card p-3 anim-pop">
        {cell.winnerTeamId ? (
          <div className="flex items-center gap-2">
            <Avatar seed={cell.winnerTeamId} size={26} />
            <div>
              <div className="text-xs font-black text-brand-navy">{cell.winnerTeamName}</div>
              <div className="text-[11px] fa-num text-brand-slate">{coins(cell.pricePaid ?? 0)}</div>
            </div>
          </div>
        ) : (
          <div className="text-xs text-brand-slate">بدون برنده</div>
        )}
        <div className="chip-navy mt-1 !py-0.5 !px-2 text-[10px]">بسته‌شده</div>
      </div>
    );
  }

  async function submit() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await bidOnSlotAction(cell.id, value);
        if (res?.error) setError(res.error);
        else onDone();
      } catch {
        setError("ارتباط با سرور برقرار نشد؛ دوباره تلاش کن.");
      }
    });
  }

  return (
    <div className="card p-3 space-y-1.5">
      <div className="chip-cyan !py-0.5 !px-2 text-[10px]">باز · {fa(cell.bidderCount)} پیشنهاددهنده</div>
      {myTeamId && !canBid ? (
        <div className="text-xs text-brand-slate">
          پیشنهاد تیم: <b className="fa-num text-brand-navy">{cell.myBid !== null ? coins(cell.myBid) : "—"}</b>
        </div>
      ) : myTeamId ? (
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            dir="ltr"
            aria-label={`مبلغ پیشنهاد برای ${AD_SLOT_KINDS[cell.kind as Kind].label} ساعت ${jtime(new Date(cell.hourStart))}`}
            className="input fa-num !py-1.5 !px-2 !text-sm w-20"
            value={raw}
            aria-invalid={value <= 0 ? true : undefined}
            onChange={(e) => setRaw(e.target.value)}
          />
          <button
            disabled={pending || value <= 0}
            onClick={submit}
            aria-label={`${cell.myBid !== null ? "ویرایش پیشنهاد" : "پیشنهاد"} برای ${AD_SLOT_KINDS[cell.kind as Kind].label} ساعت ${jtime(new Date(cell.hourStart))}`}
            className="btn-cyan !px-2.5 !py-1.5 !text-xs disabled:opacity-40"
          >
            {cell.myBid !== null ? "ویرایش" : "پیشنهاد"}
          </button>
        </div>
      ) : (
        <div className="text-xs text-brand-slate">بدون تیم</div>
      )}
      {error && <div className="anim-pop"><Alert kind="error">{error}</Alert></div>}
    </div>
  );
}
