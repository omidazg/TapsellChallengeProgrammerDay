"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { Alert } from "@/components/ui";
import { fa, coins, jtime } from "@/lib/persian";
import { bidOnSlotAction } from "./actions";
import { AD_SLOT_KINDS } from "@/lib/constants";
import type { SlotCell } from "@/lib/adslots";

type Kind = keyof typeof AD_SLOT_KINDS;
const KINDS = Object.keys(AD_SLOT_KINDS) as Kind[];

export function SlotGrid({ cells, myTeamId, treasury }: { cells: SlotCell[]; myTeamId: string | null; treasury: number }) {
  const hours = Array.from(new Set(cells.map((c) => c.hourStart))).sort();
  const byKey = new Map(cells.map((c) => [`${c.kind}|${c.hourStart}`, c]));
  const router = useRouter();

  const committedOpen = cells.filter((c) => c.status === "OPEN" && c.myBid !== null).reduce((s, c) => s + (c.myBid ?? 0), 0);

  return (
    <div className="overflow-x-auto">
      {myTeamId && (
        <div className="mb-3 text-xs text-brand-slate">
          خزانهٔ تیم: <b className="fa-num text-brand-navy">{coins(treasury)}</b> · تعهد باز فعلی:{" "}
          <b className="fa-num text-brand-navy">{coins(committedOpen)}</b>
        </div>
      )}
      <table className="w-full min-w-[560px] border-separate border-spacing-2">
        <thead>
          <tr>
            <th className="text-right text-xs font-bold text-brand-slate">ساعت</th>
            {KINDS.map((k) => (
              <th key={k} className="text-right text-xs font-bold text-brand-slate">
                {AD_SLOT_KINDS[k].emoji} {AD_SLOT_KINDS[k].label}
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
                    {cell ? <Cell cell={cell} myTeamId={myTeamId} onDone={() => router.refresh()} /> : <span className="text-brand-slate text-xs">—</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Cell({ cell, myTeamId, onDone }: { cell: SlotCell; myTeamId: string | null; onDone: () => void }) {
  const [value, setValue] = useState(cell.myBid ?? 0);
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
      const res = await bidOnSlotAction(cell.id, value);
      if (res?.error) setError(res.error);
      else onDone();
    });
  }

  return (
    <div className="card p-3 space-y-1.5">
      <div className="chip-cyan !py-0.5 !px-2 text-[10px]">باز · {fa(cell.bidderCount)} پیشنهاددهنده</div>
      {myTeamId ? (
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            min={1}
            className="input !py-1.5 !px-2 !text-sm w-20"
            value={value}
            onChange={(e) => setValue(Number(e.target.value))}
          />
          <button disabled={pending || value <= 0} onClick={submit} className="btn-cyan !px-2.5 !py-1.5 !text-xs disabled:opacity-40">
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
