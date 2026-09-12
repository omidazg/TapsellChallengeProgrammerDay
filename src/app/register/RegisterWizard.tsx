"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { Alert, Stat } from "@/components/ui";
import { ROLES, POWERS, type RoleKey, type PowerKey } from "@/lib/constants";
import { fa } from "@/lib/persian";
import { registerAction } from "./actions";
import { DEPARTMENTS, type Department } from "./departments";

const STEPS = ["حساب کاربری", "نقش", "قدرت", "کد بزن", "پیش‌نمایش"] as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Stats = { coffee: number; bugs: number; sleep: number; confidence: number };

export function RegisterWizard({ nextUrl }: { nextUrl?: string | null }) {
  const [step, setStep] = useState(0);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [department, setDepartment] = useState<string>("");
  const [role, setRole] = useState<RoleKey | null>(null);
  const [power, setPower] = useState<PowerKey | null>(null);
  const [stats, setStats] = useState<Stats>({ coffee: 5, bugs: 50, sleep: 7, confidence: 100 });
  const [ran, setRan] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const avatarSeed = useMemo(
    () => (role && power ? `${role}-${power}-${stats.coffee}-${stats.bugs}-${stats.sleep}-${stats.confidence}-${nickname}` : ""),
    [role, power, stats, nickname]
  );

  function next() {
    setError(null);
    if (step === 0) {
      if (!email.trim() || !password || password.length < 6 || nickname.trim().length < 2 || !department) {
        setError("همهٔ فیلدها را کامل کن؛ رمز عبور حداقل ۶ نویسه باشد.");
        return;
      }
      if (!EMAIL_RE.test(email.trim())) {
        setError("ایمیل نامعتبر است.");
        return;
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
  function back() {
    setError(null);
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
    setError(null);
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
      });
      if (res?.error) {
        setError(res.error);
        // خطاهای مربوط به حساب در مرحلهٔ ۱ قابل اصلاح‌اند
        if (/ایمیل|رمز|نام مستعار|دپارتمان/.test(res.error)) setStep(0);
      }
    });
  }

  return (
    <div className="mx-auto max-w-3xl">
      <ol className="mb-8 flex items-center justify-between stagger">
        {STEPS.map((label, i) => (
          <li key={label} aria-current={i === step ? "step" : undefined} className="flex flex-1 items-center gap-1.5 sm:gap-2">
            <span
              className={`flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-black ${
                i === step ? "bg-brand-red text-white" : i < step ? "bg-brand-cyan text-white" : "bg-brand-ice text-brand-slate"
              }`}
            >
              {fa(i + 1)}
            </span>
            <span className={`inline text-[10px] sm:text-xs font-bold truncate ${i === step ? "text-brand-navy" : "text-brand-slate"}`}>{label}</span>
            {i < STEPS.length - 1 && <span className="mx-1 h-px flex-1 bg-brand-mist" />}
          </li>
        ))}
      </ol>

      {error && (
        <div className="mb-6 anim-pop">
          <Alert kind="error">{error}</Alert>
        </div>
      )}

      <div key={step} className="card p-6 md:p-8 anim-rise">
        {step === 0 && (
          <div className="grid gap-4">
            <h2 className="text-xl font-black text-brand-navy">اطلاعات حساب</h2>
            <div>
              <label className="label" htmlFor="email">ایمیل</label>
              <input id="email" type="email" autoComplete="email" maxLength={120} className="input" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ایمیل سازمانی‌ات" />
            </div>
            <div>
              <label className="label" htmlFor="password">رمز عبور</label>
              <input id="password" type="password" autoComplete="new-password" minLength={6} maxLength={72} className="input" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="حداقل ۶ نویسه" />
            </div>
            <div>
              <label className="label" htmlFor="nickname">نام مستعار</label>
              <input id="nickname" type="text" autoComplete="nickname" maxLength={30} className="input" value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="مثلاً کد-نویس" />
            </div>
            <div>
              <label className="label" htmlFor="department">دپارتمان</label>
              <select id="department" className="input" value={department} onChange={(e) => setDepartment(e.target.value)}>
                <option value="">انتخاب کن…</option>
                {DEPARTMENTS.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
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
            <button type="button" onClick={next} className="btn-cyan w-full sm:w-auto">
              مرحلهٔ بعد
            </button>
          )}
          {step === STEPS.length - 1 && (
            <button type="button" onClick={submit} disabled={pending} className="btn-primary w-full sm:w-auto">
              {pending ? "در حال ثبت…" : "ثبت‌نام و ورود به میدان"}
            </button>
          )}
        </div>
      </div>
      <p className="mt-6 text-center text-sm text-brand-slate">
        قبلاً ثبت‌نام کرده‌ای؟{" "}
        <Link href={nextUrl ? `/login?next=${encodeURIComponent(nextUrl)}` : "/login"} className="font-bold text-brand-cyan-dark">
          وارد شو
        </Link>
      </p>
    </div>
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
