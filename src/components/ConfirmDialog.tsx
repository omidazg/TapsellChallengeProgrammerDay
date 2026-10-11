"use client";

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type FormEvent } from "react";

/**
 * پنجرهٔ تأیید دسترس‌پذیر و راست‌به‌چپ، جایگزین window.confirm() بومی مرورگر.
 *
 * - با <dialog> بومی و showModal(): بقیهٔ صفحه inert می‌شود (فوکوس داخل پنجره می‌ماند)،
 *   پنجره در top layer روی همهٔ عناصر شناور می‌نشیند و Escape آن را «انصراف» می‌کند.
 * - فوکوس اول روی «انصراف» است (پیش‌فرض امن برای کارهای برگشت‌ناپذیر) و پس از بستن به
 *   عنصری که پنجره را باز کرده برمی‌گردد.
 * - ConfirmProvider یک‌بار در AppShell نصب می‌شود؛ بیرون از آن (مثلاً در تست) useConfirm به
 *   window.confirm برمی‌گردد.
 *
 * استفاده:
 *   const confirm = useConfirm();
 *   if (!(await confirm({ title, body, confirmLabel, destructive: true }))) return;
 *
 * برای فرم‌هایی که با onSubmit و preventDefault تأیید می‌گرفتند:
 *   const confirmSubmit = useConfirmSubmit();
 *   <form action={…} onSubmit={(e) => confirmSubmit(e, "…حذف شود؟")}>
 */

export type ConfirmOptions = {
  /** پرسش اصلی (عنوان پنجره) */
  title: string;
  /** توضیح تکمیلی؛ \n به خط تازه تبدیل می‌شود */
  body?: string;
  /** برچسب دکمهٔ تأیید؛ پیش‌فرض «تأیید» */
  confirmLabel?: string;
  /** برچسب دکمهٔ انصراف؛ پیش‌فرض «انصراف» */
  cancelLabel?: string;
  /** کار برگشت‌ناپذیر یا حذف: دکمهٔ تأیید قرمز می‌شود */
  destructive?: boolean;
};

type ConfirmFn = (opts: ConfirmOptions | string) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

function normalize(opts: ConfirmOptions | string): ConfirmOptions {
  return typeof opts === "string" ? { title: opts } : opts;
}

function nativeConfirm(opts: ConfirmOptions | string): Promise<boolean> {
  const o = normalize(opts);
  return Promise.resolve(typeof window !== "undefined" && window.confirm(o.body ? `${o.title}\n${o.body}` : o.title));
}

type Pending = { opts: ConfirmOptions; resolve: (ok: boolean) => void };

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  // پرسش‌های هم‌زمان (نادر) پشت سر هم نشان داده می‌شوند، نه روی هم
  const queueRef = useRef<Pending[]>([]);
  const titleId = useId();
  const bodyId = useId();

  const confirm = useCallback<ConfirmFn>((opts) => {
    return new Promise<boolean>((resolve) => {
      const item = { opts: normalize(opts), resolve };
      setPending((cur) => {
        if (cur) {
          queueRef.current.push(item);
          return cur;
        }
        return item;
      });
    });
  }, []);

  // باز کردن پنجره پس از رندر محتوای تازه
  useEffect(() => {
    const d = dialogRef.current;
    if (!pending || !d) return;
    if (!d.open) {
      const active = document.activeElement;
      returnFocusRef.current = active instanceof HTMLElement && active !== document.body ? active : null;
      if (typeof d.showModal === "function") d.showModal();
      else d.setAttribute("open", "");
    }
    cancelRef.current?.focus();
  }, [pending]);

  const settle = useCallback(
    (ok: boolean) => {
      if (!pending) return;
      pending.resolve(ok);
      const next = queueRef.current.shift() ?? null;
      if (!next) {
        const d = dialogRef.current;
        if (d?.open) {
          if (typeof d.close === "function") d.close();
          else d.removeAttribute("open");
        }
        const back = returnFocusRef.current;
        returnFocusRef.current = null;
        // اگر عنصر بازکننده هنوز در صفحه است فوکوس به آن برمی‌گردد
        if (back && back.isConnected) back.focus();
      }
      setPending(next);
    },
    [pending]
  );

  const opts = pending?.opts;
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <dialog
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={opts?.body ? bodyId : undefined}
        data-confirm-dialog=""
        dir="rtl"
        // Escape رویداد cancel می‌دهد؛ بستن را خودمان انجام می‌دهیم تا Promise هم حل شود
        onCancel={(e) => {
          e.preventDefault();
          settle(false);
        }}
        // کلیک روی بک‌دراپ (خودِ عنصر dialog، بیرون از جعبه) = انصراف
        onClick={(e) => {
          if (e.target === e.currentTarget) settle(false);
        }}
        className="confirm-dialog m-auto w-[min(92vw,26rem)] max-h-[85dvh] overflow-y-auto rounded-3xl border border-brand-mist bg-white p-0 text-brand-navy shadow-lift"
      >
        {opts && (
          <div className="p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <span
                aria-hidden
                className={`inline-flex size-10 shrink-0 items-center justify-center rounded-full text-lg ${opts.destructive ? "bg-red-50 text-brand-red" : "bg-brand-ice text-brand-cyan-dark"}`}
              >
                {opts.destructive ? "⚠" : "؟"}
              </span>
              <div className="min-w-0 flex-1">
                <h2 id={titleId} className="text-base font-black leading-7 whitespace-pre-line break-words">
                  {opts.title}
                </h2>
                {opts.body && (
                  <p id={bodyId} className="mt-1.5 text-sm leading-6 text-brand-slate whitespace-pre-line break-words">
                    {opts.body}
                  </p>
                )}
              </div>
            </div>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button ref={cancelRef} type="button" onClick={() => settle(false)} className="btn-ghost min-h-11" data-confirm-cancel="">
                {opts.cancelLabel ?? "انصراف"}
              </button>
              <button
                type="button"
                onClick={() => settle(true)}
                className={`${opts.destructive ? "btn-primary" : "btn-cyan"} min-h-11`}
                data-confirm-accept=""
              >
                {opts.confirmLabel ?? "تأیید"}
              </button>
            </div>
          </div>
        )}
      </dialog>
    </ConfirmContext.Provider>
  );
}

/** تابع تأیید async؛ بیرون از ConfirmProvider همان window.confirm است. */
export function useConfirm(): ConfirmFn {
  return useContext(ConfirmContext) ?? nativeConfirm;
}

/**
 * برای فرم‌هایی که در onSubmit تأیید می‌گیرند (معمولاً با action سرور): ارسال را نگه می‌دارد،
 * پنجره را نشان می‌دهد و در صورت تأیید همان فرم را با همان دکمهٔ submitter دوباره ارسال می‌کند
 * (name/value دکمه و action فرم حفظ می‌شود). در ارسال دوم بدون پرسش رد می‌شود.
 */
export function useConfirmSubmit() {
  const confirm = useConfirm();
  return useCallback(
    (e: FormEvent<HTMLFormElement>, opts: ConfirmOptions | string) => {
      const form = e.currentTarget;
      if (form.dataset.confirmed === "1") {
        delete form.dataset.confirmed;
        return;
      }
      e.preventDefault();
      const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
      void confirm(opts).then((ok) => {
        if (!ok || !form.isConnected) return;
        form.dataset.confirmed = "1";
        try {
          form.requestSubmit(submitter && submitter.isConnected ? submitter : undefined);
        } catch {
          delete form.dataset.confirmed;
        }
      });
    },
    [confirm]
  );
}
