"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PhoneVerify } from "@/components/PhoneVerify";
import { requestProfileOtpAction, verifyProfilePhoneAction, removePhoneAction } from "./actions";

/** ثبت یا تغییر شمارهٔ موبایل با کد پیامکی؛ بعد از آن ورود با شماره هم ممکن است */
export function PhoneCard({ phone, smsEnabled }: { phone: string | null; smsEnabled: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <div className="card p-6 anim-rise" id="phone">
      <h3 className="mb-1 text-lg font-black text-brand-navy">شمارهٔ موبایل</h3>
      <p className="mb-4 text-sm text-brand-slate">
        با شمارهٔ تأییدشده می‌توانی بدون رمز و فقط با کد پیامکی وارد شوی.
      </p>
      {phone && !editing ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-bold text-brand-navy" dir="ltr">{phone}</span>
          <span className="chip-ok text-[11px]">✓ تأییدشده</span>
          {smsEnabled && (
            <button type="button" className="btn-ghost !py-1 !px-3 text-xs" onClick={() => setEditing(true)}>
              تغییر شماره
            </button>
          )}
          <button
            type="button"
            disabled={pending}
            className="text-xs font-bold text-brand-red hover:underline"
            onClick={() => {
              if (!confirm("شمارهٔ موبایل از حسابت برداشته شود؟ ورود با کد پیامکی دیگر ممکن نیست.")) return;
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
