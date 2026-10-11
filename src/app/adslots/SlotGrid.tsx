"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { Alert } from "@/components/ui";
import { useConfirm } from "@/components/ConfirmDialog";
import { coins, jtime } from "@/lib/persian";
import { buyAdSlotAction } from "./actions";
import { AD_SLOT_KINDS } from "@/lib/constants";
import type { SlotCell } from "@/lib/adslots";

type Kind = keyof typeof AD_SLOT_KINDS;
const KINDS = Object.keys(AD_SLOT_KINDS) as Kind[];

export function SlotGrid({
  cells,
  canBuy,
  spendable,
}: {
  cells: SlotCell[];
  /** آیا کاربر اصلاً می‌تواند بخرد (تیم، محصول ثبت‌شده، سهمیهٔ تیم، فاز)؛ موجودی هر خانه جدا بررسی می‌شود */
  canBuy: boolean;
  /** سکه‌های قابل‌خرج کاربر؛ اعتبارسنجی نهایی سمت سرور است */
  spendable: number;
}) {
  const hours = Array.from(new Set(cells.map((c) => c.hourStart))).sort();
  const byKey = new Map(cells.map((c) => [`${c.kind}|${c.hourStart}`, c]));
  const router = useRouter();

  const renderCell = (cell: SlotCell) => (
    // کلید شامل وضعیت است تا پس از refresh حالت قبلی (خطا/در حال خرید) نماند.
    <Cell key={`${cell.id}|${cell.state}`} cell={cell} canBuy={canBuy} spendable={spendable} onDone={() => router.refresh()} />
  );

  if (cells.length === 0) {
    return <p className="text-sm text-brand-slate">هنوز جایگاهی تعریف نشده است.</p>;
  }

  return (
    <div>
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
  canBuy,
  spendable,
  onDone,
}: {
  cell: SlotCell;
  canBuy: boolean;
  spendable: number;
  onDone: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const confirm = useConfirm();
  const label = `${AD_SLOT_KINDS[cell.kind as Kind].label} ساعت ${jtime(new Date(cell.hourStart))}`;

  if (cell.state === "SOLD") {
    return (
      <div className={`card p-3 anim-pop ${cell.mine ? "ring-2 ring-brand-cyan" : ""}`}>
        <div className="flex items-center gap-2">
          <Avatar seed={cell.winnerTeamId ?? cell.id} size={26} />
          <div className="min-w-0">
            <div className="text-xs font-black text-brand-navy truncate">{cell.winnerTeamName ?? "—"}</div>
            <div className="text-xs fa-num text-brand-slate">{coins(cell.pricePaid ?? cell.price)}</div>
          </div>
        </div>
        <div className={`${cell.mine ? "chip-ok" : "chip-navy"} mt-1 !py-0.5 !px-2 text-xs`}>{cell.mine ? "مال تیم تو" : "فروخته شد"}</div>
      </div>
    );
  }

  if (cell.state === "PAST") {
    return (
      <div className="card p-3 bg-brand-ice">
        <div className="text-xs text-brand-slate">زمانش گذشت</div>
      </div>
    );
  }

  const short = cell.price > spendable;

  async function buy() {
    if (!(await confirm({ title: `${label} را به قیمت ${coins(cell.price)} برای تیمت بخرم؟`, confirmLabel: "بخر" }))) return;
    setError(null);
    startTransition(async () => {
      try {
        const res = await buyAdSlotAction(cell.id);
        if (res.error) setError(res.error);
        else onDone();
      } catch {
        setError("ارتباط با سرور برقرار نشد؛ دوباره تلاش کن.");
      }
    });
  }

  return (
    <div className="card p-3 space-y-1.5">
      <div className="chip-cyan !py-0.5 !px-2 text-xs">آزاد</div>
      {canBuy ? (
        <button
          type="button"
          disabled={pending || short}
          onClick={buy}
          aria-label={`خرید ${label} به قیمت ${coins(cell.price)}${short ? "، سکهٔ کافی نداری" : ""}`}
          className="btn-cyan !px-2.5 !py-1.5 !text-xs w-full disabled:opacity-40"
        >
          {pending ? "در حال خرید…" : `خرید · ${coins(cell.price)}`}
        </button>
      ) : (
        <div className="fa-num text-xs font-bold text-brand-navy">{coins(cell.price)}</div>
      )}
      {canBuy && short && <div className="text-xs text-brand-red">سکهٔ کافی نداری</div>}
      {error && (
        <div className="anim-pop">
          <Alert kind="error">{error}</Alert>
        </div>
      )}
    </div>
  );
}
