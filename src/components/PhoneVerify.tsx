"use client";

import { useEffect, useState, useTransition } from "react";
import { Alert } from "@/components/ui";
import { fa } from "@/lib/persian";

type SendResult = { ok: true; resendSec: number; devCode?: string } | { error: string };
type VerifyResult = { ok: true; phone: string; proof?: string } | { error: string };

/**
 * ورود شماره → دریافت کد پیامکی → تأیید. منطق سرور از بیرون داده می‌شود
 * (ثبت‌نام: گواهی کوتاه‌عمر برمی‌گرداند؛ پروفایل: شماره را همان‌جا ذخیره می‌کند).
 */
export function PhoneVerify({
  label = "شمارهٔ موبایل",
  initialPhone = "",
  verifiedPhone,
  onSend,
  onVerify,
  onVerified,
  onPhoneChange,
  verifyLabel = "تأیید شماره",
}: {
  label?: string;
  initialPhone?: string;
  /** شماره‌ای که قبلاً تأیید شده (برای نمایش تیک) */
  verifiedPhone?: string | null;
  onSend: (phone: string) => Promise<SendResult>;
  onVerify: (phone: string, code: string) => Promise<VerifyResult>;
  onVerified: (phone: string, proof?: string) => void;
  /** هر تغییر در فیلد شماره (تأیید قبلی را باطل می‌کند) */
  onPhoneChange?: (value: string) => void;
  verifyLabel?: string;
}) {
  const [phone, setPhone] = useState(initialPhone);
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  function send() {
    setError(null);
    startTransition(async () => {
      const res = await onSend(phone);
      if ("error" in res) return setError(res.error);
      setSent(true);
      setCode("");
      setDevCode(res.devCode ?? null);
      setCooldown(res.resendSec);
    });
  }

  function verify() {
    setError(null);
    startTransition(async () => {
      const res = await onVerify(phone, code);
      if ("error" in res) return setError(res.error);
      setSent(false);
      setDevCode(null);
      setPhone(res.phone);
      onVerified(res.phone, res.proof);
    });
  }

  const isVerified = !!verifiedPhone && verifiedPhone === phone;

  return (
    <div className="space-y-2">
      <label className="label" htmlFor="phone-verify">{label}</label>
      <div className="flex gap-2">
        <input
          id="phone-verify"
          type="tel"
          dir="ltr"
          inputMode="tel"
          autoComplete="tel"
          className="input flex-1"
          placeholder="09xxxxxxxxx"
          value={phone}
          onChange={(e) => {
            setPhone(e.target.value);
            setSent(false);
            setDevCode(null);
            onPhoneChange?.(e.target.value);
          }}
        />
        {isVerified ? (
          <span className="chip-ok self-center whitespace-nowrap">✓ تأییدشده</span>
        ) : (
          <button
            type="button"
            onClick={send}
            disabled={pending || !phone.trim() || cooldown > 0}
            className="btn-ghost whitespace-nowrap !px-3 !text-sm"
          >
            {cooldown > 0 ? `${fa(cooldown)} ثانیه` : sent ? "ارسال دوباره" : "ارسال کد"}
          </button>
        )}
      </div>

      {sent && !isVerified && (
        <div className="flex gap-2">
          <input
            aria-label="کد تأیید پیامکی"
            dir="ltr"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            className="input flex-1 tracking-[0.4em] text-center"
            placeholder="••••••"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <button type="button" onClick={verify} disabled={pending || code.trim().length < 6} className="btn-cyan whitespace-nowrap !px-3 !text-sm">
            {pending ? "…" : verifyLabel}
          </button>
        </div>
      )}
      {sent && devCode && (
        <p className="text-xs font-bold text-brand-cyan-dark">
          محیط آزمایشی — کد: <span dir="ltr">{devCode}</span>
        </p>
      )}
      {error && <Alert kind="error">{error}</Alert>}
    </div>
  );
}
