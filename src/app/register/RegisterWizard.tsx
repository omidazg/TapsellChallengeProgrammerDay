"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { Alert, Stat } from "@/components/ui";
import { ROLES, POWERS, type RoleKey, type PowerKey } from "@/lib/constants";
import { fa } from "@/lib/persian";
import {
  registerAction,
  checkRegisterEmailAction,
  requestRegisterOtpAction,
  verifyRegisterOtpAction,
  type AccountField,
  type AccountFieldErrors,
  type RegisterFailure,
} from "./actions";
import { PhoneVerify } from "@/components/PhoneVerify";
import { PasswordInput } from "@/components/PasswordInput";
import { DEPARTMENTS, type Department } from "./departments";

const STEPS = ["حساب کاربری", "نقش", "قدرت", "کد بزن", "پیش‌نمایش"] as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Stats = { coffee: number; bugs: number; sleep: number; confidence: number };

/** ترتیب فیلدهای مرحلهٔ اول؛ فوکوس پس از خطا به اولین فیلد نامعتبر می‌رود */
const ACCOUNT_FIELDS: AccountField[] = ["email", "password", "nickname", "department", "phone"];
/** شناسهٔ ورودی هر فیلد (شماره داخل PhoneVerify است) */
const FIELD_INPUT_ID: Record<AccountField, string> = {
  email: "email",
  password: "password",
  nickname: "nickname",
  department: "department",
  phone: "phone-verify",
};
const INVALID_CLS = "aria-invalid:border-brand-red aria-invalid:focus:border-brand-red aria-invalid:focus:ring-brand-red/30";

export function RegisterWizard({
  nextUrl,
  smsEnabled = false,
  initialEmail = "",
}: {
  nextUrl?: string | null;
  smsEnabled?: boolean;
  initialEmail?: string;
}) {
  const [step, setStep] = useState(0);
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [department, setDepartment] = useState<string>("");
  // شماره اختیاری است؛ فقط پس از تأیید کد پیامکی (با گواهی کوتاه‌عمر سرور) ارسال می‌شود
  const [phoneInput, setPhoneInput] = useState("");
  const [phone, setPhone] = useState<string | null>(null);
  const [phoneProof, setPhoneProof] = useState<string | null>(null);
  const [role, setRole] = useState<RoleKey | null>(null);
  const [power, setPower] = useState<PowerKey | null>(null);
  const [stats, setStats] = useState<Stats>({ coffee: 5, bugs: 50, sleep: 7, confidence: 100 });
  const [ran, setRan] = useState(false);
  const [running, setRunning] = useState(false);
  // خطای کلی (بالای کارت) جدا از خطاهای هر فیلد مرحلهٔ اول (زیر همان فیلد)
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<AccountFieldErrors>({});
  const [hint, setHint] = useState<RegisterFailure["hint"]>(undefined);
  // شیء تازه در هر خطا تا حتی با همان فیلد، افکت فوکوس دوباره اجرا شود
  const [focusTarget, setFocusTarget] = useState<{ field: AccountField } | null>(null);
  const [checking, setChecking] = useState(false);
  const [pending, startTransition] = useTransition();

  const avatarSeed = useMemo(
    () => (role && power ? `${role}-${power}-${stats.coffee}-${stats.bugs}-${stats.sleep}-${stats.confidence}-${nickname}` : ""),
    [role, power, stats, nickname]
  );

  // فوکوس پس از رندر (و پس از بازگشت به مرحلهٔ اول) به اولین فیلد نامعتبر می‌رود
  useEffect(() => {
    if (focusTarget) document.getElementById(FIELD_INPUT_ID[focusTarget.field])?.focus();
  }, [focusTarget]);

  function clearErrors() {
    setError(null);
    setFieldErrors({});
    setHint(undefined);
  }

  /** خطای فیلدی → زیر همان فیلد در مرحلهٔ اول؛ بقیه → پیام کلی بالای کارت */
  function fail(res: RegisterFailure) {
    const fe = res.fieldErrors ?? {};
    const first = ACCOUNT_FIELDS.find((f) => fe[f]);
    if (first) {
      setError(null);
      setFieldErrors(fe);
      setHint(res.hint);
      setStep(0);
      setFocusTarget({ field: first });
    } else {
      setError(res.error);
      setFieldErrors({});
      setHint(undefined);
    }
  }

  /** ویرایش هر فیلد خطای همان فیلد را پاک می‌کند */
  function clearField(f: AccountField) {
    setFieldErrors((prev) => {
      if (!prev[f]) return prev;
      const rest = { ...prev };
      delete rest[f];
      return rest;
    });
    if (f === "email") setHint(undefined);
  }

  function invalidProps(f: AccountField) {
    return fieldErrors[f] ? { "aria-invalid": true as const, "aria-describedby": `${f}-error` } : {};
  }

  async function next() {
    clearErrors();
    if (step === 0) {
      const fe: AccountFieldErrors = {};
      const em = email.trim();
      if (!em) fe.email = "ایمیل را وارد کن.";
      else if (!EMAIL_RE.test(em)) fe.email = "ایمیل نامعتبر است.";
      if (!password) fe.password = "رمز عبور را وارد کن.";
      else if (password.length < 6) fe.password = "رمز عبور باید حداقل ۶ نویسه باشد.";
      if (nickname.trim().length < 2) fe.nickname = "نام مستعار باید بین ۲ تا ۳۰ نویسه باشد.";
      if (!department) fe.department = "دپارتمان را انتخاب کن.";
      if (phoneInput.trim() && !phoneProof) fe.phone = "شمارهٔ موبایل را با کد پیامکی تأیید کن، یا فیلدش را خالی بگذار.";
      if (Object.keys(fe).length) {
        fail({ error: "", fieldErrors: fe });
        return;
      }
      // لیست سفید را همین‌جا چک کن، نه بعد از پنج مرحله
      setChecking(true);
      try {
        const res = await checkRegisterEmailAction(email, phone, phoneProof);
        if ("error" in res) {
          fail(res);
          return;
        }
      } catch {
        setError("بررسی ایمیل انجام نشد؛ دوباره تلاش کن.");
        return;
      } finally {
        setChecking(false);
      }
    }
    if (step === 1 && !role) {
      setError("یک نقش انتخاب کن.");
      return;
    }
    if (step === 2 && !power) {
      setError("یک قدرت انتخاب کن.");
      return;
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }
  // فرم واقعی تا Enter در فیلدها هم مرحله را جلو ببرد
  function onFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (checking || pending) return;
    if (step < STEPS.length - 1) void next();
    else submit();
  }
  function back() {
    clearErrors();
    setStep((s) => Math.max(s - 1, 0));
  }

  function run() {
    setRunning(true);
    setRan(false);
    window.setTimeout(() => {
      setRunning(false);
      setRan(true);
    }, 550);
  }

  function submit() {
    if (!role || !power) return;
    clearErrors();
    startTransition(async () => {
      const res = await registerAction({
        email,
        password,
        nickname,
        department: department as Department,
        role,
        power,
        coffee: stats.coffee,
        bugs: stats.bugs,
        sleep: stats.sleep,
        confidence: stats.confidence,
        next: nextUrl,
        phone,
        phoneProof,
      });
      // خطاهای فیلدهای حساب، کاربر را به مرحلهٔ ۱ و همان فیلد برمی‌گرداند
      if (res?.error) fail(res);
    });
  }

  return (
    <div className="mx-auto max-w-3xl">
      <ol className="mb-2 flex items-center justify-between stagger sm:mb-8">
        {STEPS.map((label, i) => (
          <li
            key={label}
            aria-current={i === step ? "step" : undefined}
            className={`flex min-w-0 items-center gap-1.5 sm:gap-2 ${i < STEPS.length - 1 ? "flex-1" : ""}`}
          >
            <span
              className={`flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-black ${
                i === step ? "bg-brand-red text-white" : i < step ? "bg-brand-cyan text-white" : "bg-brand-ice text-brand-slate"
              }`}
            >
              {fa(i + 1)}
            </span>
            <span className={`hidden text-xs font-bold truncate sm:inline ${i === step ? "text-brand-navy" : "text-brand-slate"}`}>{label}</span>
            {i < STEPS.length - 1 && <span className="mx-1 h-px min-w-2 flex-1 bg-brand-mist" />}
          </li>
        ))}
      </ol>
      <p className="mb-8 text-center text-xs font-bold text-brand-navy sm:hidden">
        مرحلهٔ {fa(step + 1)} از {fa(STEPS.length)} · {STEPS[step]}
      </p>

      {error && (
        <div id="register-error" className="mb-6 anim-pop">
          <Alert kind="error">{error}</Alert>
        </div>
      )}

      <form onSubmit={onFormSubmit} noValidate>
      <div key={step} className="card p-6 md:p-8 anim-rise">
        {step === 0 && (
          <div className="grid gap-4">
            <h2 className="text-xl font-black text-brand-navy">اطلاعات حساب</h2>
            <div>
              <label className="label" htmlFor="email">ایمیل</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                maxLength={120}
                className={`input ${INVALID_CLS}`}
                dir="ltr"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  clearField("email");
                }}
                placeholder="ایمیل سازمانی‌ات"
                required
                {...invalidProps("email")}
              />
              <FieldError id="email-error" msg={fieldErrors.email} />
              {fieldErrors.email && hint && <EmailHint hint={hint} email={email.trim()} nextUrl={nextUrl} />}
            </div>
            <div>
              <label className="label" htmlFor="password">رمز عبور</label>
              <PasswordInput
                id="password"
                autoComplete="new-password"
                minLength={6}
                maxLength={72}
                className={INVALID_CLS}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  clearField("password");
                }}
                placeholder="حداقل ۶ نویسه"
                required
                {...invalidProps("password")}
              />
              <FieldError id="password-error" msg={fieldErrors.password} />
            </div>
            <div>
              <label className="label" htmlFor="nickname">نام مستعار</label>
              <input
                id="nickname"
                type="text"
                autoComplete="nickname"
                maxLength={30}
                className={`input ${INVALID_CLS}`}
                value={nickname}
                onChange={(e) => {
                  setNickname(e.target.value);
                  clearField("nickname");
                }}
                placeholder="مثلاً کد-نویس"
                required
                {...invalidProps("nickname")}
              />
              <FieldError id="nickname-error" msg={fieldErrors.nickname} />
            </div>
            <div>
              <label className="label" htmlFor="department">دپارتمان</label>
              <select
                id="department"
                className={`input ${INVALID_CLS}`}
                value={department}
                onChange={(e) => {
                  setDepartment(e.target.value);
                  clearField("department");
                }}
                required
                {...invalidProps("department")}
              >
                <option value="">انتخاب کن…</option>
                {DEPARTMENTS.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
              <FieldError id="department-error" msg={fieldErrors.department} />
            </div>
            {smsEnabled && (
              <div>
                <PhoneVerify
                  label="شمارهٔ موبایل (اختیاری — برای ورود با کد پیامکی)"
                  initialPhone={phoneInput}
                  verifiedPhone={phone}
                  onSend={requestRegisterOtpAction}
                  onVerify={verifyRegisterOtpAction}
                  onVerified={(p, proof) => {
                    setPhone(p);
                    setPhoneInput(p);
                    setPhoneProof(proof ?? null);
                    clearField("phone");
                  }}
                  onPhoneChange={(v) => {
                    setPhoneInput(v);
                    setPhone(null);
                    setPhoneProof(null);
                    clearField("phone");
                  }}
                />
                {/* ورودی شماره داخل PhoneVerify است و aria-describedby نمی‌گیرد؛ پس خطا خودش اعلام می‌شود */}
                <FieldError id="phone-error" msg={fieldErrors.phone} announce />
              </div>
            )}
          </div>
        )}

        {step === 1 && (
          <div>
            <h2 className="mb-4 text-xl font-black text-brand-navy">نقشت را انتخاب کن</h2>
            <div className="grid gap-4 sm:grid-cols-3 stagger">
              {(Object.keys(ROLES) as RoleKey[]).map((k) => {
                const r = ROLES[k];
                const active = role === k;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setRole(k)}
                    aria-pressed={active}
                    className={`rounded-2xl border-2 p-5 text-right transition anim-rise focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan ${active ? "border-brand-red bg-red-50 shadow-lift" : "border-brand-mist bg-white hover:border-brand-cyan"}`}
                  >
                    <div className="text-3xl">{r.emoji}</div>
                    <div className="mt-2 font-black text-brand-navy">{r.label}</div>
                    <div className="mt-1 text-xs text-brand-slate">{r.desc}</div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <h2 className="mb-4 text-xl font-black text-brand-navy">قدرت ویژه‌ات را انتخاب کن</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 stagger">
              {(Object.keys(POWERS) as PowerKey[]).map((k) => {
                const p = POWERS[k];
                const active = power === k;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setPower(k)}
                    aria-pressed={active}
                    className={`rounded-2xl border-2 p-5 text-right transition anim-rise focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan ${active ? "border-brand-cyan-dark bg-brand-ice shadow-lift" : "border-brand-mist bg-white hover:border-brand-cyan"}`}
                  >
                    <div className="text-3xl">{p.emoji}</div>
                    <div className="mt-2 font-black text-brand-navy">{p.label}</div>
                    <div className="mt-1 text-xs text-brand-slate">{p.desc}</div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {step === 3 && (
          <div>
            <h2 className="mb-1 text-xl font-black text-brand-navy">خودت را کد بزن</h2>
            <p className="mb-4 text-sm text-brand-slate">عددهای شخصیتت را تنظیم کن و اجرا بزن.</p>
            <div dir="ltr" className="overflow-x-auto rounded-2xl bg-brand-navy px-5 py-5 font-mono text-sm leading-8 text-brand-mist shadow-inner">
              <div>{"developer = {"}</div>
              <CodeRow label="coffee" min={0} max={10} value={stats.coffee} onChange={(v) => setStats((s) => ({ ...s, coffee: v }))} />
              <CodeRow label="bugs" min={0} max={100} value={stats.bugs} onChange={(v) => setStats((s) => ({ ...s, bugs: v }))} />
              <CodeRow label="sleep" min={0} max={12} value={stats.sleep} onChange={(v) => setStats((s) => ({ ...s, sleep: v }))} />
              <CodeRow label="confidence" min={0} max={150} value={stats.confidence} onChange={(v) => setStats((s) => ({ ...s, confidence: v }))} last />
              <div>{"}"}</div>
            </div>
            <div className="mt-4 flex items-center gap-4">
              <button type="button" onClick={run} className="btn-primary" disabled={running}>
                {running ? "در حال اجرا…" : "اجرا ▶"}
              </button>
              {ran && !running && (
                <div dir="ltr" className="anim-pop flex-1 overflow-x-auto whitespace-pre-wrap rounded-2xl bg-brand-ice px-4 py-3 font-mono text-xs text-brand-navy">
                  {`>>> print(developer)\n{'coffee': ${stats.coffee}, 'bugs': ${stats.bugs}, 'sleep': ${stats.sleep}, 'confidence': ${stats.confidence}}`}
                </div>
              )}
            </div>
          </div>
        )}

        {step === 4 && role && power && (
          <div>
            <h2 className="mb-4 text-xl font-black text-brand-navy">پیش‌نمایش شخصیت</h2>
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
              <Avatar seed={avatarSeed} size={120} className="shrink-0" />
              <div className="flex-1 min-w-0 text-center sm:text-right">
                <div className="text-2xl font-black text-brand-navy break-words">{nickname}</div>
                <div className="mt-1 flex flex-wrap justify-center sm:justify-start gap-2">
                  <span className="chip-red">{ROLES[role].emoji} {ROLES[role].label}</span>
                  <span className="chip-cyan">{POWERS[power].emoji} {POWERS[power].label}</span>
                  <span className="chip-navy">{department}</span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Stat label="قهوه" value={fa(stats.coffee)} />
                  <Stat label="باگ" value={fa(stats.bugs)} />
                  <Stat label="خواب" value={fa(stats.sleep)} />
                  <Stat label="اعتمادبه‌نفس" value={fa(stats.confidence)} />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="mt-6 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          {step > 0 && (
            <button type="button" onClick={back} className="btn-ghost w-full sm:w-auto">
              مرحلهٔ قبل
            </button>
          )}
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-3">
          {step < STEPS.length - 1 && (
            <button type="submit" disabled={checking} className="btn-cyan w-full sm:w-auto">
              {checking ? "در حال بررسی ایمیل…" : "مرحلهٔ بعد"}
            </button>
          )}
          {step === STEPS.length - 1 && (
            <button type="submit" disabled={pending} className="btn-primary w-full sm:w-auto">
              {pending ? "در حال ثبت…" : "ثبت‌نام و ورود به میدان"}
            </button>
          )}
        </div>
      </div>
      </form>
      <p className="mt-6 text-center text-sm text-brand-slate">
        قبلاً ثبت‌نام کرده‌ای؟{" "}
        <Link href={loginHref(email.trim(), nextUrl)} className="font-bold text-brand-cyan-dark">
          وارد شو
        </Link>
      </p>
    </div>
  );
}

function loginHref(email: string, nextUrl?: string | null) {
  const q = new URLSearchParams();
  if (nextUrl) q.set("next", nextUrl);
  if (EMAIL_RE.test(email)) q.set("email", email);
  return q.size ? `/login?${q}` : "/login";
}

/** پیام خطای زیر فیلد؛ `announce` برای فیلدی که aria-describedby نمی‌گیرد */
function FieldError({ id, msg, announce = false }: { id: string; msg?: string; announce?: boolean }) {
  if (!msg) return null;
  return (
    <p id={id} role={announce ? "alert" : undefined} className="mt-1.5 text-xs font-bold text-brand-red anim-pop">
      {msg}
    </p>
  );
}

/** قدم بعدی برای ایمیلی که نمی‌تواند ثبت‌نام کند */
function EmailHint({ hint, email, nextUrl }: { hint: NonNullable<RegisterFailure["hint"]>; email: string; nextUrl?: string | null }) {
  const q = encodeURIComponent(email);
  if (hint === "REQUEST")
    return (
      <Link href={`/access-request?email=${q}`} className="btn-cyan mt-2 w-full !py-2 !text-sm sm:w-auto">
        درخواست دسترسی
      </Link>
    );
  if (hint === "TRACK")
    return (
      <Link href={`/access-request?email=${q}#access-status`} className="btn-ghost mt-2 w-full !py-2 !text-sm sm:w-auto">
        پیگیری وضعیت درخواست
      </Link>
    );
  return (
    <Link href={loginHref(email, nextUrl)} className="btn-ghost mt-2 w-full !py-2 !text-sm sm:w-auto">
      ورود با همین ایمیل
    </Link>
  );
}

function CodeRow({
  label,
  min,
  max,
  value,
  onChange,
  last = false,
}: {
  label: string;
  min: number;
  max: number;
  value: number;
  onChange: (v: number) => void;
  last?: boolean;
}) {
  return (
    <div className="pr-4">
      {"  \""}
      {label}
      {'": '}
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        aria-label={label}
        onChange={(e) => {
          const n = Math.max(min, Math.min(max, Number(e.target.value) || 0));
          onChange(n);
        }}
        className="mx-1 w-16 rounded-md border border-brand-cyan/40 bg-white/10 px-2 py-0.5 text-center text-brand-ice focus:bg-white/20 focus:outline-none"
      />
      {!last ? "," : ""}
    </div>
  );
}
