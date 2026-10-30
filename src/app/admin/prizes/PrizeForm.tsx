"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui";
import { useConfirmSubmit } from "@/components/ConfirmDialog";
import { ENTRY_CATEGORY_LABEL } from "@/lib/tracks";
import type { PrizeRow } from "@/lib/prizes";
import { deletePrizeAction, savePrizeAction, type PrizeActionState } from "./actions";

export type PrizeTrackOption = { id: string; name: string; mixed: boolean };
export type PrizeProductOption = { id: string; label: string; trackId: string };

export function PrizeForm({
  prize,
  tracks,
  products,
}: {
  /** بدون آن، فرم جایزهٔ تازه است. */
  prize?: PrizeRow;
  tracks: PrizeTrackOption[];
  products: PrizeProductOption[];
}) {
  const [state, formAction, pending] = useActionState<PrizeActionState, FormData>(savePrizeAction, {});
  const [deleteState, deleteAction, deleting] = useActionState<PrizeActionState, FormData>(deletePrizeAction, {});
  const confirmSubmit = useConfirmSubmit();
  const [trackId, setTrackId] = useState(prize?.trackId ?? tracks[0]?.id ?? "");
  const [kind, setKind] = useState(prize?.kind ?? "RANK");
  const formRef = useRef<HTMLFormElement>(null);
  const idp = `prize-${prize?.id ?? "new"}`;
  const mixed = tracks.find((t) => t.id === trackId)?.mixed ?? false;
  const options = products.filter((p) => p.trackId === trackId);

  // فرم جایزهٔ تازه پس از ذخیرهٔ موفق خالی می‌شود.
  useEffect(() => {
    if (state.ok && !prize) formRef.current?.reset();
  }, [state, prize]);

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
        {prize && <input type="hidden" name="id" value={prize.id} />}
        <div className="grid gap-3 sm:grid-cols-[5rem_minmax(0,1fr)_minmax(0,14rem)]">
          <div>
            <label className="label" htmlFor={`${idp}-emoji`}>ایموجی</label>
            <input id={`${idp}-emoji`} name="emoji" maxLength={16} defaultValue={prize?.emoji ?? "🏆"} className="input !py-2 !px-3 w-full" />
          </div>
          <div>
            <label className="label" htmlFor={`${idp}-label`}>عنوان</label>
            <input id={`${idp}-label`} name="label" required maxLength={120} defaultValue={prize?.label ?? ""} className="input !py-2 !px-3 w-full" />
          </div>
          <div>
            <label className="label" htmlFor={`${idp}-amount`}>مبلغ (تومان)</label>
            <input
              id={`${idp}-amount`}
              name="amountToman"
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              defaultValue={prize?.amountToman ?? ""}
              placeholder="نهایی نشده"
              className="input !py-2 !px-3 w-full fa-num"
            />
          </div>
        </div>
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-5">
          <div>
            <label className="label" htmlFor={`${idp}-track`}>محور</label>
            <select id={`${idp}-track`} name="trackId" value={trackId} onChange={(e) => setTrackId(e.target.value)} className="input !py-2 !px-3 w-full">
              {tracks.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor={`${idp}-category`}>دسته</label>
            <select id={`${idp}-category`} name="category" defaultValue={prize?.category ?? ""} disabled={!mixed} className="input !py-2 !px-3 w-full disabled:opacity-50">
              <option value="">همهٔ محور</option>
              <option value="TECH">{ENTRY_CATEGORY_LABEL.TECH}</option>
              <option value="NON_TECH">{ENTRY_CATEGORY_LABEL.NON_TECH}</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor={`${idp}-kind`}>نوع</label>
            <select id={`${idp}-kind`} name="kind" value={kind} onChange={(e) => setKind(e.target.value)} className="input !py-2 !px-3 w-full">
              <option value="RANK">رتبه (خودکار)</option>
              <option value="SPECIAL">ویژه (انتخابی)</option>
            </select>
          </div>
          {kind === "RANK" && (
            <div>
              <label className="label" htmlFor={`${idp}-rank`}>رتبه</label>
              <input id={`${idp}-rank`} name="rank" type="number" min={1} max={100} step={1} defaultValue={prize?.rank ?? 1} className="input !py-2 !px-3 w-full fa-num" />
            </div>
          )}
          <div>
            <label className="label" htmlFor={`${idp}-order`}>ترتیب نمایش</label>
            <input id={`${idp}-order`} name="order" type="number" min={0} step={1} defaultValue={prize?.order ?? 0} className="input !py-2 !px-3 w-full fa-num" />
          </div>
        </div>
        {kind === "SPECIAL" && (
          <div>
            <label className="label" htmlFor={`${idp}-winner`}>محصول برنده</label>
            <select
              key={trackId}
              id={`${idp}-winner`}
              name="winnerProductId"
              defaultValue={trackId === prize?.trackId ? (prize?.winnerProductId ?? "") : ""}
              className="input !py-2 !px-3 w-full"
            >
              <option value="">— هنوز انتخاب نشده —</option>
              {options.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </div>
        )}
        {state.error && <Alert kind="error">{state.error}</Alert>}
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={pending} className={prize ? "btn-ghost !py-2 !px-4 text-sm min-h-10" : "btn-primary !py-2 !px-4 text-sm min-h-10"}>
            {pending ? "…" : prize ? "ذخیره" : "افزودن جایزه"}
          </button>
          {state.ok && !pending && <span className="text-emerald-600 text-xs font-bold" role="status">ذخیره شد</span>}
        </div>
      </form>
      {prize && (
        <form
          action={deleteAction}
          onSubmit={(e) => confirmSubmit(e, { title: `جایزهٔ «${prize.label}» حذف شود؟`, confirmLabel: "حذف", destructive: true })}
        >
          <input type="hidden" name="id" value={prize.id} />
          <button type="submit" disabled={deleting} className="btn-ghost !py-2 !px-4 text-sm min-h-10 !text-brand-red">
            {deleting ? "…" : "حذف جایزه"}
          </button>
          {deleteState.error && <Alert kind="error">{deleteState.error}</Alert>}
        </form>
      )}
    </div>
  );
}
