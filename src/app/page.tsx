import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getPhase, PHASE_LABEL, PHASE_DESC, type Phase } from "@/lib/phase";
import { ROLES, POWERS, SCORE_WEIGHTS, DEFAULTS } from "@/lib/constants";
import { fa, coins } from "@/lib/persian";
import { Container, Stat } from "@/components/ui";
import { Avatar } from "@/components/Avatar";
import { prisma } from "@/lib/db";
import { PhaseCountdown } from "./PhaseCountdown";

export default async function Home() {
  const [user, { phase, endsAt }] = await Promise.all([getCurrentUser(), getPhase()]);

  if (!user) {
    return <LoggedOutLanding phase={phase} />;
  }

  const [idea, teamSize] = await Promise.all([
    user.teamId ? prisma.idea.findUnique({ where: { teamId: user.teamId }, select: { submittedAt: true } }) : null,
    user.teamId ? prisma.user.count({ where: { teamId: user.teamId } }) : 0,
  ]);
  const cta = nextAction({ ...user, teamSize }, phase, !!idea?.submittedAt);

  return (
      <Container className="pt-10 space-y-8">
        <div className="flex flex-wrap items-center gap-4 anim-rise">
          <Avatar seed={user.avatarSeed || user.id} size={56} className="shrink-0" />
          <div className="min-w-0">
            <div className="text-sm text-brand-slate">سلام،</div>
            <h1 className="text-xl sm:text-2xl md:text-3xl font-black text-brand-navy break-words">{user.nickname} 👋</h1>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4 stagger">
          <div className="card p-6 flex flex-col justify-between">
            <div>
              <div className="text-xs font-bold text-brand-cyan-dark mb-1">فاز جاری</div>
              <div className="text-xl font-black text-brand-navy">{PHASE_LABEL[phase]}</div>
              <p className="mt-1 text-sm text-brand-slate">{PHASE_DESC[phase]}</p>
            </div>
            <div className="mt-4 flex items-center justify-between">
              <span className="text-xs text-brand-slate">زمان باقی‌مانده</span>
              <PhaseCountdown endsAt={endsAt ? endsAt.toISOString() : null} />
            </div>
          </div>

          <div className="card p-6 flex flex-col justify-between bg-brand-navy text-white">
            <div>
              <div className="text-xs font-bold text-brand-mist mb-1">کار بعدی تو</div>
              <div className="text-xl font-black">{cta.label}</div>
            </div>
            <Link href={cta.href} className="btn-primary mt-4 self-start">
              {cta.label} ←
            </Link>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 stagger">
          <Stat label="🌱 کیف بذر" value={coins(user.seedWallet)} tone="cyan" />
          <Stat label="🛒 کیف خرید" value={coins(user.buyWallet)} tone="red" />
          {user.team && <Stat label="🏦 خزانهٔ تیم" value={coins(user.team.treasury)} tone="navy" />}
        </div>

        {user.team ? (
          <Link href="/team" className="card p-5 flex items-center justify-between gap-3 hover:shadow-lift transition anim-rise">
            <div className="flex items-center gap-3 min-w-0">
              <Avatar seed={user.team.logoSeed || user.team.id} size={40} className="shrink-0" />
              <div className="min-w-0">
                <div className="font-black text-brand-navy truncate">{user.team.name}</div>
                <div className="text-xs text-brand-slate">اتاق تیم را ببین</div>
              </div>
            </div>
            <span className="text-brand-cyan-dark font-bold shrink-0">←</span>
          </Link>
        ) : (
          <Link href="/team" className="card p-5 flex items-center justify-between gap-3 hover:shadow-lift transition anim-rise bg-brand-ice">
            <div className="font-black text-brand-navy">هنوز عضو هیچ تیمی نیستی</div>
            <span className="text-brand-cyan-dark font-bold shrink-0 whitespace-nowrap">تیم بساز ←</span>
          </Link>
        )}
      </Container>
  );
}

type CurrentUser = { teamId: string | null; seedWallet: number; buyWallet: number; teamSize?: number };

function nextAction(user: CurrentUser, phase: Phase, hasIdea: boolean): { href: string; label: string } {
  if (phase === "CLOSED") return { href: "/results", label: "نتایج را ببین" };
  if (!user.teamId) return { href: "/team", label: "تیم بساز یا به یکی بپیوند" };

  switch (phase) {
    case "REGISTRATION":
      return (user.teamSize ?? 3) < 3
        ? { href: "/team", label: "هم‌تیمی دعوت کن؛ تیمت هنوز کامل نیست" }
        : { href: "/profile", label: "شخصیتت را کامل کن" };
    case "IDEATION":
      return hasIdea
        ? { href: "/idea", label: "ایده‌ات را بازبینی کن" }
        : { href: "/idea", label: "ایده‌ات را ثبت کن" };
    case "SEED_ROUND":
      return user.seedWallet > 0
        ? { href: "/invest", label: "روی یک ایده سرمایه‌گذاری کن" }
        : { href: "/leaderboard", label: "کیف بذرت تمام شد؛ جدول را ببین" };
    case "BUILD":
      return { href: "/build", label: "محصولت را در مرکز ساخت کامل کن" };
    case "MARKET":
      return user.buyWallet > 0
        ? { href: "/market", label: "از بازار خرید کن" }
        : { href: "/adslots", label: "کیف خریدت تمام شد؛ جایگاه تبلیغاتی بگیر" };
    case "AUCTION":
      return { href: "/auction", label: "به حراج زنده بپیوند" };
    default:
      return { href: "/team", label: "به اتاق تیم سر بزن" };
  }
}

const TIMELINE = [
  { emoji: "💡", title: "اتاق ایده", desc: "۲۴ ساعت برای ثبت ایده و درخواست سرمایه." },
  { emoji: "💰", title: "دور سرمایه‌گذاری", desc: "۲۴ ساعت برای سرمایه‌گذاری روی ایده‌های تیم‌های دیگر." },
  { emoji: "🛠️", title: "ساخت", desc: "۴۸ ساعت برای ساخت محصول، تیزر و صفحهٔ فروش." },
  { emoji: "🔨", title: "روز بازار و حراج زنده", desc: "بفروش، قلب بگیر و نسخهٔ ویژه‌ات را زنده حراج کن." },
];

const SCORE_ITEMS: { key: keyof typeof SCORE_WEIGHTS; label: string }[] = [
  { key: "sales", label: "فروش خالص" },
  { key: "quality", label: "کیفیت محصول" },
  { key: "capital", label: "جذب سرمایه" },
  { key: "roi", label: "سود سرمایه‌گذار" },
  { key: "teaser", label: "تیزر" },
  { key: "community", label: "جامعه (خرید/قلب)" },
];

const FAQ = [
  {
    q: "کیف بذر و کیف خرید چه فرقی دارند؟",
    a: "کیف بذر فقط در دور سرمایه‌گذاری برای سرمایه‌گذاری روی ایدهٔ تیم‌های دیگر استفاده می‌شود. کیف خرید در روز بازار برای خرید محصول و شرکت در حراج زنده به کار می‌رود.",
  },
  {
    q: "اگر سکه‌ام را خرج نکنم چه می‌شود؟",
    a: `هر سکهٔ خرج‌نشده در پایان بازی ${fa(DEFAULTS.penaltyPerCoin)} امتیاز جریمه دارد؛ پس بهتر است هر دو کیف را تا آخر بازی خرج کنی.`,
  },
  {
    q: "می‌توانم روی تیم خودم سرمایه‌گذاری کنم؟",
    a: "بله، اما سرمایه‌گذاری روی تیم خودت «سرمایه‌گذاری خودی» حساب می‌شود و در محاسبهٔ جذب سرمایهٔ خارجی و سود سهام شرکت نمی‌کند.",
  },
  {
    q: "چرا سقف سرمایه‌گذاری/خرید روی هر هدف وجود دارد؟",
    a: `برای اینکه سرمایه بین تیم‌های بیشتری پخش شود، هر نفر حداکثر ${fa(DEFAULTS.maxPerTarget)} سکه می‌تواند روی یک ایده یا محصول بگذارد.`,
  },
  {
    q: "جایگاه‌های تبلیغاتی چطور قیمت‌گذاری می‌شوند؟",
    a: "با قاعدهٔ حراج قیمت-دوم مهروموم: تیم‌ها مخفیانه پیشنهاد می‌دهند، برندهٔ جایگاه را می‌گیرد اما فقط به‌اندازهٔ دومین پیشنهاد بالا پرداخت می‌کند.",
  },
  {
    q: "در حراج زنده اگر لحظهٔ آخر کسی پیشنهاد بدهد چه می‌شود؟",
    a: "قانون ضد-اسنایپ فعال است: اگر نزدیک پایان زمان پیشنهادی ثبت شود، زمان حراج به‌طور خودکار تمدید می‌شود تا فرصت پاسخ عادلانه باشد.",
  },
];

function LoggedOutLanding({ phase }: { phase: Phase }) {
  return (
    <>
      <section className="bg-hero bg-dots relative overflow-hidden">
        <Container className="pt-16 pb-20 relative">
          <div className="grid lg:grid-cols-2 gap-10 items-center">
            <div className="anim-rise">
              <span className="chip-cyan mb-4">{PHASE_LABEL[phase]} · روز برنامه‌نویس تپسل</span>
              <h1 className="text-4xl md:text-5xl font-black text-brand-navy leading-[1.25]">
                میدان بنیان‌گذاران <span className="text-brand-red">تپسل</span>
              </h1>
              <p className="mt-4 text-lg text-brand-slate max-w-xl">
                یک بازار استارتاپی چهارروزه: ایده بده، سرمایه جذب کن، در ۴۸ ساعت بساز، در روز بازار بفروش و در حراج زنده برنده شو.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/register" className="btn-primary">ثبت‌نام</Link>
                <Link href="/login" className="btn-ghost">ورود</Link>
              </div>
            </div>
            <HeroIllustration />
          </div>
        </Container>
      </section>

      <Container className="py-16 space-y-6">
        <h2 className="text-2xl font-black text-brand-navy text-center">چهار روز، چهار مرحله</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 stagger">
          {TIMELINE.map((step, i) => (
            <div key={step.title} className="card p-5 text-center">
              <div className="text-3xl mb-2">{step.emoji}</div>
              <div className="text-xs font-bold text-brand-cyan-dark mb-1">مرحلهٔ {fa(i + 1)}</div>
              <div className="font-black text-brand-navy">{step.title}</div>
              <p className="mt-1 text-xs text-brand-slate">{step.desc}</p>
            </div>
          ))}
        </div>
      </Container>

      <Container className="py-16 space-y-6">
        <h2 className="text-2xl font-black text-brand-navy text-center">چطور برنده می‌شویم؟</h2>
        <p className="text-center text-brand-slate max-w-2xl mx-auto">
          امتیاز نهایی هر تیم از شش معیار ساخته می‌شود؛ عدد جلوی هر معیار سهم آن از امتیاز کل است.
        </p>
        <div className="flex flex-wrap justify-center gap-3 stagger">
          {SCORE_ITEMS.map((s) => (
            <span key={s.key} className="chip-navy !text-sm !px-4 !py-2">
              {s.label} <b className="fa-num mr-1">{fa(SCORE_WEIGHTS[s.key])}</b>
            </span>
          ))}
        </div>
      </Container>

      <Container className="py-16 space-y-10">
        <div className="space-y-6">
          <h2 className="text-2xl font-black text-brand-navy text-center">نقش‌ها</h2>
          <div className="grid sm:grid-cols-3 gap-4 stagger">
            {(Object.keys(ROLES) as (keyof typeof ROLES)[]).map((r) => (
              <div key={r} className="card p-5 text-center">
                <div className="text-3xl mb-2">{ROLES[r].emoji}</div>
                <div className="font-black text-brand-navy">{ROLES[r].label}</div>
                <p className="mt-1 text-xs text-brand-slate">{ROLES[r].desc}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <h2 className="text-2xl font-black text-brand-navy text-center">قدرت‌های ویژه</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 stagger">
            {(Object.keys(POWERS) as (keyof typeof POWERS)[]).map((p) => (
              <div key={p} className="card p-5 text-center">
                <div className="text-3xl mb-2">{POWERS[p].emoji}</div>
                <div className="font-black text-brand-navy">{POWERS[p].label}</div>
                <p className="mt-1 text-xs text-brand-slate">{POWERS[p].desc}</p>
              </div>
            ))}
          </div>
        </div>
      </Container>

      <Container className="py-16 space-y-6">
        <h2 className="text-2xl font-black text-brand-navy text-center">سوالات پرتکرار</h2>
        <div className="max-w-2xl mx-auto space-y-3 stagger">
          {FAQ.map((f) => (
            <details key={f.q} className="card p-4 group">
              <summary className="cursor-pointer font-bold text-brand-navy list-none flex items-center justify-between">
                {f.q}
                <span className="text-brand-cyan-dark group-open:rotate-45 transition-transform">＋</span>
              </summary>
              <p className="mt-2 text-sm text-brand-slate">{f.a}</p>
            </details>
          ))}
        </div>
      </Container>

      <Container className="pb-16">
        <p className="text-center text-xs text-brand-slate">
          میدان بنیان‌گذاران تپسل یک بازی شبیه‌سازی کسب‌وکار برای روز برنامه‌نویس است؛ سکه‌ها واقعی نیستند.
        </p>
      </Container>
    </>
  );
}

function HeroIllustration() {
  return (
    <div className="relative h-72 md:h-96 anim-rise" aria-hidden>
      <svg viewBox="0 0 400 340" className="w-full h-full">
        <circle cx="200" cy="170" r="130" fill="var(--color-brand-ice)" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center anim-float">
        <RocketShape />
      </div>
      <CoinShape className="absolute top-6 left-10 anim-float" style={{ animationDelay: "0.3s" }} size={44} />
      <ChartShape className="absolute bottom-8 right-6 anim-float" style={{ animationDelay: "0.6s" }} />
      <CoinShape className="absolute top-16 right-16 anim-float" style={{ animationDelay: "0.9s" }} size={54} />
      <CoinShape className="absolute bottom-20 left-16 anim-float" style={{ animationDelay: "1.2s" }} size={38} />
    </div>
  );
}

function RocketShape({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg width="70" height="70" viewBox="0 0 100 100" className={className} style={style}>
      <path d="M50 5 C70 25 75 55 60 80 L40 80 C25 55 30 25 50 5 Z" fill="var(--color-brand-red)" />
      <circle cx="50" cy="40" r="10" fill="white" />
      <path d="M40 78 L30 95 L45 85 Z" fill="var(--color-gold)" />
      <path d="M60 78 L70 95 L55 85 Z" fill="var(--color-gold)" />
    </svg>
  );
}

function ChartShape({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg width="90" height="70" viewBox="0 0 120 90" className={className} style={style}>
      <rect x="4" y="86" width="112" height="2" fill="var(--color-brand-slate)" />
      <rect x="10" y="50" width="18" height="36" rx="3" fill="var(--color-brand-cyan)" />
      <rect x="40" y="30" width="18" height="56" rx="3" fill="var(--color-brand-navy)" />
      <rect x="70" y="10" width="18" height="76" rx="3" fill="var(--color-brand-red)" />
      <rect x="100" y="40" width="18" height="46" rx="3" fill="var(--color-gold)" />
    </svg>
  );
}

function CoinShape({ className = "", style, size = 48 }: { className?: string; style?: React.CSSProperties; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 60 60" className={className} style={style}>
      <circle cx="30" cy="30" r="28" fill="var(--color-gold)" stroke="#c07f00" strokeWidth="2" />
      <circle cx="30" cy="30" r="20" fill="none" stroke="#c07f00" strokeWidth="1.5" opacity=".6" />
    </svg>
  );
}
