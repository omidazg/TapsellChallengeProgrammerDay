"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { Alert } from "@/components/ui";
import { useConfirm } from "@/components/ConfirmDialog";
import { coins, jdatetime, toEnDigits } from "@/lib/persian";
import { bidAdSlotAction } from "./actions";
import { AD_SLOT_KINDS } from "@/lib/constants";
import type { SlotCell } from "@/lib/adslots";

type Kind = keyof typeof AD_SLOT_KINDS;
const KINDS = Object.keys(AD_SLOT_KINDS) as Kind[];

type ProductOption = { id: string; label: string };

export function SlotGrid({
  cells,
  products,
  canBid,
  atCap,
  spendable,
  showPast = false,
}: {
  cells: SlotCell[];
  /** محصول‌های ثبت‌شدهٔ تیم کاربر؛ پیشنهاد برای یکی از این‌هاست */
  products: ProductOption[];
  /** آیا کاربر اصلاً می‌تواند پیشنهاد بدهد (تیم، محصول ثبت‌شده، باز بودن بخش) */
  canBid: boolean;
  /** تیم به سقف رسیده؛ فقط بازه‌هایی را که پیشنهاد برترشان را دارد می‌تواند بالا ببرد */
  atCap: boolean;
  /** سکه‌های قابل‌خرج کاربر؛ اعتبارسنجی نهایی سمت سرور است */
  spendable: number;
  /** بازه‌های گذشته هم نشان داده شوند */
  showPast?: boolean;
}) {
  const router = useRouter();
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const product = products.find((p) => p.id === productId) ?? null;

  const allHours = Array.from(new Set(cells.map((c) => c.hourStart))).sort();
  const activeHours = allHours.filter((h) => cells.some((c) => c.hourStart === h && c.state !== "PAST"));
  // بازه‌های گذشته فقط وقتی دیده می‌شوند که چیز دیگری نمانده یا صفحه فقط‌خواندنی است.
  const hours = showPast || activeHours.length === 0 ? allHours : activeHours;
  const byKey = new Map(cells.map((c) => [`${c.kind}|${c.hourStart}`, c]));

  const renderCell = (cell: SlotCell) => (
    // کلید شامل وضعیت و کمترین پیشنهاد است تا پس از refresh حالت قبلی (خطا/مبلغ) نماند.
    <Cell
      key={`${cell.id}|${cell.state}|${cell.minBid}`}
      cell={cell}
      product={canBid ? product : null}
      atCap={atCap}
      spendable={spendable}
      onDone={() => router.refresh()}
    />
  );

  if (cells.length === 0) {
    return <p className="text-sm text-brand-slate">هنوز جایگاهی تعریف نشده است.</p>;
  }

  return (
    <div className="space-y-4">
      {canBid && products.length > 1 && (
        <div className="max-w-md">
          <label className="label" htmlFor="adslotProduct">پیشنهادها برای کدام محصول ثبت شود؟</label>
          <select id="adslotProduct" value={productId} onChange={(e) => setProductId(e.target.value)} className="input">
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        </div>
      )}

      {/* زیر sm: هر بازه یک کارت عمودی با جایگاه‌هایش (جدول روی گوشی اسکرول افقی می‌خورد). */}
      <div className="space-y-3 sm:hidden">
        {hours.map((h) => (
          <section key={h} className="rounded-2xl border border-brand-mist bg-brand-ice p-3">
            <h3 className="fa-num font-black text-brand-navy mb-2">{jdatetime(new Date(h))}</h3>
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
        <table className="w-full min-w-[640px] border-separate border-spacing-2">
          <caption className="sr-only">جایگاه‌های تبلیغاتی به تفکیک بازه و نوع</caption>
          <thead>
            <tr>
              <th scope="col" className="text-right text-xs font-bold text-brand-slate">شروع بازه</th>
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
                <td className="fa-num font-black text-brand-navy align-top py-2 text-sm">{jdatetime(new Date(h))}</td>
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

function Winner({ cell, note }: { cell: SlotCell; note: string }) {
  return (
    <div className={`card p-3 ${cell.mine ? "ring-2 ring-brand-cyan" : ""}`}>
      <div className="flex items-center gap-2">
        <Avatar seed={cell.winnerTeamId ?? cell.id} size={26} />
        <div className="min-w-0">
          <div className="text-xs font-black text-brand-navy truncate">{cell.winnerTeamName ?? "—"}</div>
          <div className="text-xs fa-num text-brand-slate">{coins(cell.pricePaid ?? 0)}</div>
        </div>
      </div>
      <div className={`${cell.mine ? "chip-ok" : "chip-navy"} mt-1 !py-0.5 !px-2 text-xs`}>{cell.mine ? `${note} · تیم تو` : note}</div>
    </div>
  );
}

function Cell({
  cell,
  product,
  atCap,
  spendable,
  onDone,
}: {
  cell: SlotCell;
  /** محصول انتخاب‌شده؛ null یعنی کاربر الان نمی‌تواند پیشنهاد بدهد */
  product: ProductOption | null;
  atCap: boolean;
  spendable: number;
  onDone: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState(String(cell.minBid));
  const [pending, startTransition] = useTransition();
  const confirm = useConfirm();
  const label = `${AD_SLOT_KINDS[cell.kind as Kind].label} بازهٔ ${jdatetime(new Date(cell.hourStart))}`;

  if (cell.state === "LIVE" || cell.state === "PAST") {
    if (cell.winnerTeamId) return <Winner cell={cell} note={cell.state === "LIVE" ? "در حال نمایش" : "برندهٔ بازه"} />;
    return (
      <div className="card p-3 bg-brand-ice">
        <div className="text-xs text-brand-slate">بدون پیشنهاد</div>
      </div>
    );
  }

  const blockedByCap = atCap && !cell.mine;
  const canBidHere = !!product && !blockedByCap;
  const short = cell.minBid > spendable;
  const inputId = `bid-${cell.id}`;

  async function bid() {
    if (!product) return;
    const value = Number.parseInt(toEnDigits(amount), 10);
    if (!Number.isFinite(value) || value < cell.minBid) {
      setError(`کمترین پیشنهاد ${coins(cell.minBid)} است.`);
      return;
    }
    if (value > spendable) {
      setError("سکهٔ کافی نداری.");
      return;
    }
    if (
      !(await confirm({
        title: `برای ${label} ${coins(value)} پیشنهاد بدهم؟`,
        body: `محصول: ${product.label}. اگر کسی بالاتر پیشنهاد بدهد، سکه‌ات کامل به کیف برمی‌گردد.`,
        confirmLabel: "ثبت پیشنهاد",
      }))
    )
      return;
    setError(null);
    startTransition(async () => {
      try {
        const res = await bidAdSlotAction(cell.id, product.id, value);
        if (res.error) setError(res.error);
        else onDone();
      } catch {
        setError("ارتباط با سرور برقرار نشد؛ دوباره تلاش کن.");
      }
    });
  }

  return (
    <div className={`card p-3 space-y-1.5 ${cell.mine ? "ring-2 ring-brand-cyan" : ""}`}>
      {cell.winnerTeamId ? (
        <div className="text-xs text-brand-slate">
          پیشنهاد برتر: <b className="fa-num text-brand-navy">{coins(cell.pricePaid ?? 0)}</b>
          <div className="truncate font-bold text-brand-navy">{cell.mine ? "پیشنهاد تیم تو" : cell.winnerTeamName}</div>
        </div>
      ) : (
        <div className="chip-cyan !py-0.5 !px-2 text-xs">بدون پیشنهاد</div>
      )}
      <div className="text-xs text-brand-slate">
        کمترین پیشنهاد بعدی: <b className="fa-num text-brand-navy">{coins(cell.minBid)}</b>
      </div>
      {canBidHere && (
        <div className="flex items-center gap-1.5">
          <label className="sr-only" htmlFor={inputId}>مبلغ پیشنهاد برای {label}</label>
          <input
            id={inputId}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="numeric"
            dir="ltr"
            className="input !px-2 !py-1.5 !text-xs w-16 min-w-0 flex-1 fa-num"
          />
          <button type="button" disabled={pending} onClick={bid} className="btn-cyan !px-2.5 !py-1.5 !text-xs shrink-0 disabled:opacity-40">
            {pending ? "ثبت…" : "پیشنهاد"}
          </button>
        </div>
      )}
      {canBidHere && short && !cell.mine && <div className="text-xs text-brand-red">سکهٔ کافی نداری</div>}
      {error && (
        <div className="anim-pop">
          <Alert kind="error">{error}</Alert>
        </div>
      )}
    </div>
  );
}
