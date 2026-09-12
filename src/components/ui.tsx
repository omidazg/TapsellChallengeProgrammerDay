import Link from "next/link";
import { fa } from "@/lib/persian";

export function PageHeader({ eyebrow, title, desc, action }: { eyebrow?: string; title: string; desc?: string; action?: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-7xl px-4 pt-10 pb-6 flex flex-wrap items-end gap-4 anim-rise">
      <div className="flex-1 min-w-[240px]">
        {eyebrow && <div className="text-xs font-bold text-brand-cyan-dark mb-1">{eyebrow}</div>}
        <h1 className="text-3xl md:text-4xl font-black text-brand-navy">{title}</h1>
        {desc && <p className="mt-2 text-brand-slate max-w-2xl">{desc}</p>}
      </div>
      {action}
    </div>
  );
}

export function Container({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`mx-auto max-w-7xl px-4 pb-16 ${className}`}>{children}</div>;
}

export function Coin({ n, label }: { n: number; label?: string }) {
  return (
    <span className="inline-flex items-center gap-1 font-black text-brand-navy fa-num">
      <span className="inline-block size-4 rounded-full bg-gradient-to-br from-amber-300 to-amber-500 shadow-inner" />
      {fa(n)}
      {label && <span className="text-xs font-medium text-brand-slate">{label}</span>}
    </span>
  );
}

export function Empty({ title, desc, cta }: { title: string; desc?: string; cta?: { href: string; label: string } }) {
  return (
    <div className="card p-10 text-center anim-pop">
      <div className="text-5xl mb-3">🪄</div>
      <h3 className="text-xl font-black">{title}</h3>
      {desc && <p className="mt-2 text-brand-slate">{desc}</p>}
      {cta && <Link href={cta.href} className="btn-primary mt-5">{cta.label}</Link>}
    </div>
  );
}

export function Locked({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="card p-10 text-center bg-brand-ice">
      <div className="text-5xl mb-3">🔒</div>
      <h3 className="text-xl font-black">{title}</h3>
      <p className="mt-2 text-brand-slate">{desc}</p>
    </div>
  );
}

export function Stat({ label, value, hint, tone = "navy" }: { label: string; value: React.ReactNode; hint?: string; tone?: "navy" | "red" | "cyan" | "gold" }) {
  const tones = { navy: "text-brand-navy", red: "text-brand-red", cyan: "text-brand-cyan-dark", gold: "text-amber-600" };
  return (
    <div className="card p-4">
      <div className="text-xs font-bold text-brand-slate">{label}</div>
      <div className={`mt-1 text-2xl font-black fa-num ${tones[tone]}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-brand-slate">{hint}</div>}
    </div>
  );
}

export function Alert({ kind = "info", children }: { kind?: "info" | "error" | "ok"; children: React.ReactNode }) {
  const cls = { info: "bg-brand-ice text-brand-navy border-brand-mist", error: "bg-red-50 text-brand-red border-red-100", ok: "bg-emerald-50 text-emerald-800 border-emerald-100" }[kind];
  return <div className={`rounded-2xl border px-4 py-3 text-sm font-medium ${cls}`}>{children}</div>;
}
