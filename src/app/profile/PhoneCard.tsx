"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PhoneVerify } from "@/components/PhoneVerify";
import { useConfirm } from "@/components/ConfirmDialog";
import { requestProfileOtpAction, verifyProfilePhoneAction, removePhoneAction } from "./actions";

/** ثبت یا تغییر شمارهٔ موبایل با کد پیامکی؛ بعد از آن ورود با شماره هم ممکن است */
export function PhoneCard({ phone, smsEnabled }: { phone: string | null; smsEnabled: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const confirm = useConfirm();

  return (
    <div className="card p-6 anim-rise" id="phone">
      <h2 className="mb-1 text-lg font-black text-brand-navy">شمارهٔ موبایل</h2>
      <p className="mb-4 text-sm text-brand-slate">
        با شمارهٔ تأییدشده می‌توانی بدون رمز و فقط با کد پیامکی وارد شوی.
      </p>
      {phone && !editing ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-bold text-brand-navy" dir="ltr">{phone}</span>
          <span className="chip-ok text-xs">✓ تأییدشده</span>
          {smsEnabled && (
            <button type="button" className="btn-ghost !py-1 !px-3 text-xs" onClick={() => setEditing(true)}>
              تغییر شماره
            </button>
          )}
          <button
            type="button"
            disabled={pending}
            className="inline-flex items-center min-h-11 px-2 text-xs font-bold text-brand-red underline-offset-4 hover:underline"
            onClick={async () => {
              if (!(await confirm({ title: "شمارهٔ موبایل از حسابت برداشته شود؟", body: "ورود با کد پیامکی دیگر ممکن نیست.", confirmLabel: "حذف شماره", destructive: true }))) return;
              startTransition(async () => {
                await removePhoneAction();
                router.refresh();
              });
            }}
          >
            حذف شماره
          </button>
        </div>
      ) : smsEnabled ? (
        <PhoneVerify
          label={phone ? "شمارهٔ تازه" : "شمارهٔ موبایل"}
          onSend={requestProfileOtpAction}
          onVerify={verifyProfilePhoneAction}
          verifyLabel="تأیید و ذخیره"
          onVerified={() => {
            setEditing(false);
            router.refresh();
          }}
        />
      ) : (
        <p className="text-sm text-brand-slate">ارسال پیامک فعلاً فعال نیست؛ برای ثبت شماره با برگزارکننده هماهنگ کن.</p>
      )}
    </div>
  );
}
