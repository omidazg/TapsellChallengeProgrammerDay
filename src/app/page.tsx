import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getPhase, phaseIndex, PHASE_LABEL, PHASE_DESC, type Phase } from "@/lib/phase";
import { ROLES, POWERS, SCORE_WEIGHTS } from "@/lib/constants";
import { SCORE_CATEGORY_ORDER, SCORE_CATEGORY_LABELS } from "@/lib/score-labels";
import { fa, coins, duration } from "@/lib/persian";
import { smsEnabled } from "@/lib/sms";
import { leaderThreshold } from "@/lib/leader";
import { Container, Stat } from "@/components/ui";
import { Avatar } from "@/components/Avatar";
import { prisma } from "@/lib/db";
import { PhaseCountdown } from "./PhaseCountdown";
import { PhaseTimeline } from "@/components/PhaseTimeline";
import { OnboardingTour } from "@/components/OnboardingTour";
import { LiveFeed } from "@/components/LiveFeed";
import { PillarGrid } from "@/components/PillarLogos";
import { GROUP_NAME } from "@/lib/pillars";
import { getEffectiveGameValues, type GameValues } from "@/lib/game-values";

export default async function Home({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  // مقادیر مؤثر بازی (تنظیم برگزارکننده یا پیش‌فرض) برای متن‌های راهنما/سؤالات پرتکرار
  const [{ welcome }, user, { phase, endsAt }, values] = await Promise.all([
    searchParams,
    getCurrentUser(),
    getPhase(),
    getEffectiveGameValues(),
  ]);

  if (!user) {
    return <LoggedOutLanding phase={phase} endsAt={endsAt ? endsAt.toISOString() : null} values={values} />;
  }

  // فقط داده‌های سبکی که برای تشخیص «کار بعدی» لازم است
  const teamId = user.teamId;
  const [idea, product, members, myVote] = await Promise.all([
    teamId && phase === "IDEATION"
      ? prisma.idea.findUnique({ where: { teamId }, select: { submittedAt: true } })
      : null,
    teamId && phase === "BUILD"
      ? prisma.product.findUnique({ where: { teamId }, select: { submittedAt: true } })
      : null,
    teamId ? prisma.user.findMany({ where: { teamId }, select: { id: true, role: true } }) : [],
    teamId
      ? prisma.teamLeaderVote.findUnique({ where: { voterId: user.id }, select: { teamId: true, candidateId: true } })
      : null,
  ]);
  // سرپرستی که دیگر عضو نیست حساب نمی‌شود (همان منطق getLeaderState)
  const storedLeader = user.team?.leaderId ?? null;
  const leaderId = storedLeader && members.some((m) => m.id === storedLeader) ? storedLeader : null;
  const cta = nextAction({
    phase,
    endsAt,
    user,
    leaderId,
    members,
    hasVoted: !!myVote && myVote.teamId === teamId && members.some((m) => m.id === myVote.candidateId),
    ideaSubmitted: !!idea?.submittedAt,
    productSubmitted: !!product?.submittedAt,
    needsPhone: smsEnabled() && !user.phone,
  });

  return (
      <Container className="pt-10 space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-4 anim-rise">
          <div className="flex items-center gap-4">
            <Avatar seed={user.avatarSeed || user.id} size={56} className="shrink-0" />
            <div className="min-w-0">
              <div className="text-sm text-brand-slate">سلام،</div>
              <h1 className="text-xl sm:text-2xl md:text-3xl font-black text-brand-navy break-words">{user.nickname} 👋</h1>
            </div>
          </div>
          <OnboardingTour autoOpen={welcome === "1"} penaltyPerCoin={values.penaltyPerCoin} />
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
              <div className="text-lg sm:text-xl font-black leading-8">{cta.title}</div>
            </div>
            <Link href={cta.href} className="btn-primary mt-4 self-start">
              {cta.action} ←
            </Link>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 stagger">
          <Stat label="🌱 کیف بذر" value={coins(user.seedWallet)} tone="cyan" />
          <Stat label="🛒 کیف خرید" value={coins(user.buyWallet)} tone="red" />
          {user.team && <Stat label="🏦 خزانهٔ تیم" value={coins(user.team.treasury)} tone="navy" />}
        </div>

        <PhaseTimeline phase={phase} endsAt={endsAt ? endsAt.toISOString() : null} />

        <LiveFeed />

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

const TEAM_FULL = 3;

type NextActionInput = {
  phase: Phase;
  endsAt: Date | null;
  user: { id: string; teamId: string | null; seedWallet: number; buyWallet: number };
  leaderId: string | null;
  members: { id: string; role: string }[];
  hasVoted: boolean;
  ideaSubmitted: boolean;
  productSubmitted: boolean;
  needsPhone: boolean;
};

/** «تا پایان دور ۲ ساعت و ۱۰ دقیقه مانده»؛ اگر زمان پایان مشخص نیست یا گذشته، خالی */
function timeLeft(endsAt: Date | null, what: string) {
  if (!endsAt) return "";
  const ms = endsAt.getTime() - Date.now();
  return ms > 0 ? ` و تا پایان ${what} ${duration(ms)} مانده` : "";
}

/**
 * مهم‌ترین قدم بعدی کاربر بر اساس وضعیت واقعی و فاز جاری.
 * title دلیل را با عدد می‌گوید؛ action فعل کوتاه دکمه است و هرگز title را تکرار نمی‌کند.
 */
function nextAction(input: NextActionInput): { href: string; title: string; action: string } {
  const { phase, endsAt, user, leaderId, members, hasVoted, ideaSubmitted, productSubmitted, needsPhone } = input;
  if (phase === "CLOSED") return { href: "/results", title: "بازی تمام شد و سودها پرداخت شده‌اند.", action: "نتایج را ببین" };

  const formingOpen = phaseIndex(phase) <= phaseIndex("IDEATION");
  if (!user.teamId) {
    return formingOpen
      ? { href: "/team", title: `هنوز عضو هیچ تیمی نیستی${timeLeft(endsAt, "این فاز")}.`, action: "تیم بساز یا بپیوند" }
      : { href: "/team", title: "عضو هیچ تیمی نیستی و تشکیل تیم بسته شده؛ با برگزارکننده هماهنگ کن.", action: "سر بزن" };
  }

  const size = members.length;
  if (formingOpen && size < TEAM_FULL) {
    const missing = TEAM_FULL - size;
    return {
      href: "/team",
      title: `تیمت ${fa(size)} از ${fa(TEAM_FULL)} نفر است؛ ${fa(missing)} هم‌تیمی دیگر لازم داری.`,
      action: "دعوت کن",
    };
  }

  if (!leaderId && size >= 2 && !hasVoted) {
    return {
      href: "/team#leader",
      title: `تیمت هنوز سرپرست ندارد و رأی تو ثبت نشده؛ ${fa(leaderThreshold(size))} رأی از ${fa(size)} لازم است.`,
      action: "رأی بده",
    };
  }

  const canManage = leaderId === user.id || (!leaderId && size <= 1);

  switch (phase) {
    case "REGISTRATION": {
      const roles = new Set(members.map((m) => m.role));
      const missingRoles = (Object.keys(ROLES) as (keyof typeof ROLES)[]).filter((r) => !roles.has(r));
      if (missingRoles.length > 0) {
        return {
          href: "/team/settings",
          title: `نقش ${missingRoles.map((r) => `${ROLES[r].emoji} ${ROLES[r].label}`).join("، ")} در تیمت خالی است؛ پیش از شروع بازی هماهنگ کنید.`,
          action: "نقش‌ها را تنظیم کن",
        };
      }
      if (needsPhone) {
        return { href: "/profile#phone", title: "شمارهٔ موبایلت ثبت نشده؛ با آن بدون رمز و با کد پیامکی وارد می‌شوی.", action: "ثبت کن" };
      }
      return { href: "/profile", title: `تیمت کامل است${timeLeft(endsAt, "ثبت‌نام")}؛ حالا شخصیت و آمارت را کامل کن.`, action: "ویرایش کن" };
    }
    case "IDEATION":
      if (ideaSubmitted) {
        return { href: "/idea", title: `ایدهٔ تیمت ثبت شده${timeLeft(endsAt, "اتاق ایده")}.`, action: "بازبینی کن" };
      }
      return canManage
        ? { href: "/idea", title: `ایدهٔ تیمت هنوز ثبت نشده${timeLeft(endsAt, "اتاق ایده")}.`, action: "ایده را ثبت کن" }
        : { href: "/idea", title: `سرپرست هنوز ایدهٔ تیم را ثبت نکرده${timeLeft(endsAt, "اتاق ایده")}.`, action: "پیش‌نویس را ببین" };
    case "SEED_ROUND":
      return user.seedWallet > 0
        ? { href: "/invest", title: `${coins(user.seedWallet)} بذر خرج‌نشده داری${timeLeft(endsAt, "دور")}.`, action: "سرمایه‌گذاری کن" }
        : { href: "/leaderboard", title: "کیف بذرت را کامل خرج کرده‌ای؛ حالا ببین ایده‌ها چطور پیش می‌روند.", action: "جدول را ببین" };
    case "BUILD":
      if (productSubmitted) {
        return { href: "/build", title: `محصول تیمت ثبت شده${timeLeft(endsAt, "ساخت")}.`, action: "بهترش کن" };
      }
      return canManage
        ? { href: "/build", title: `محصول تیمت هنوز ثبت نشده${timeLeft(endsAt, "ساخت")}.`, action: "بساز" }
        : { href: "/build", title: `سرپرست هنوز محصول تیم را ثبت نکرده${timeLeft(endsAt, "ساخت")}.`, action: "کمک کن" };
    case "MARKET":
      return user.buyWallet > 0
        ? { href: "/market", title: `${coins(user.buyWallet)} خرید خرج‌نشده داری${timeLeft(endsAt, "روز بازار")}.`, action: "خرید کن" }
        : { href: "/adslots", title: "کیف خریدت را کامل خرج کرده‌ای؛ جایگاه‌های تبلیغاتی تیم‌ها را دنبال کن.", action: "سر بزن" };
    case "AUCTION":
      return user.buyWallet > 0
        ? { href: "/auction", title: `حراج زنده در جریان است و ${coins(user.buyWallet)} در کیف خریدت داری.`, action: "پیشنهاد بده" }
        : { href: "/auction", title: `حراج زنده در جریان است${timeLeft(endsAt, "حراج")}.`, action: "تماشا کن" };
    default:
      return { href: "/team", title: "اتاق تیم منتظر توست.", action: "سر بزن" };
  }
}

const SCORE_ITEMS = SCORE_CATEGORY_ORDER;

// پاسخ تابعی با مقادیر مؤثر بازی ساخته می‌شود
const FAQ: { q: string; a: string | ((v: GameValues) => string) }[] = [
  {
    q: "کیف بذر و کیف خرید چه فرقی دارند؟",
    a: "کیف بذر فقط در دور سرمایه‌گذاری برای سرمایه‌گذاری روی ایدهٔ تیم‌های دیگر استفاده می‌شود. کیف خرید در روز بازار برای خرید محصول و شرکت در حراج زنده به کار می‌رود.",
  },
  {
    q: "اگر سکه‌ام را خرج نکنم چه می‌شود؟",
    a: (v) => `هر سکهٔ خرج‌نشده در پایان بازی ${fa(v.penaltyPerCoin)} امتیاز جریمه دارد؛ پس بهتر است هر دو کیف را تا آخر بازی خرج کنی.`,
  },
  {
    q: "می‌توانم روی تیم خودم سرمایه‌گذاری کنم؟",
    a: "نه، سرمایه‌گذاری روی ایدهٔ تیم خودت مجاز نیست. باید ایدهٔ تیم‌های دیگر را ارزیابی کنی و روی چند تای امیدوارکننده سرمایه‌گذاری کنی؛ سود آن‌ها به امتیاز «پرتفوی» تیمت هم اضافه می‌شود.",
  },
  {
    q: "چرا سقف سرمایه‌گذاری/خرید روی هر هدف وجود دارد؟",
    a: (v) => `برای اینکه سرمایه بین تیم‌های بیشتری پخش شود، هر نفر حداکثر ${fa(v.maxPerTarget)} سکه می‌تواند روی یک ایده یا محصول بگذارد.`,
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

function LoggedOutLanding({ phase, endsAt, values }: { phase: Phase; endsAt: string | null; values: GameValues }) {
  return (
    <>
      <section className="bg-hero bg-dots relative overflow-hidden">
        <Container className="pt-16 pb-20 relative">
          <div className="grid lg:grid-cols-2 gap-10 items-center">
            <div className="anim-rise">
              <span className="chip-cyan mb-4">{PHASE_LABEL[phase]} · روز برنامه‌نویس {GROUP_NAME}</span>
              <h1 className="text-4xl md:text-5xl font-black text-brand-navy leading-[1.25]">
                میدان <span className="text-brand-red">بنیان‌گذاران</span>
              </h1>
              <p className="mt-4 text-lg text-brand-slate max-w-xl">
                یک بازار استارتاپی چهارروزه برای همهٔ پیلارهای {GROUP_NAME}: ایده بده، سرمایه جذب کن، در ۴۸ ساعت بساز، در روز بازار بفروش و در حراج زنده برنده شو.
              </p>
              {phase !== "CLOSED" && (
                <div className="mt-6 flex items-center gap-3">
                  <span className="text-xs text-brand-slate">زمان باقی‌مانده تا پایان این فاز</span>
                  <PhaseCountdown endsAt={endsAt} />
                </div>
              )}
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/register" className="btn-primary">ثبت‌نام</Link>
                <Link href="/login" className="btn-ghost">ورود</Link>
                <Link href="/guide" className="btn-ghost">📖 راهنمای کامل بازی</Link>
              </div>
            </div>
            <HeroIllustration />
          </div>
        </Container>
      </section>

      <Container className="py-16 space-y-6">
        <h2 className="text-2xl font-black text-brand-navy text-center">با حضور پیلارهای {GROUP_NAME}</h2>
        <p className="text-center text-brand-slate max-w-2xl mx-auto">
          میدان بنیان‌گذاران برای همهٔ پیلارهای {GROUP_NAME} برگزار می‌شود و بچه‌های همهٔ این مجموعه‌ها در آن رقابت می‌کنند.
        </p>
        <PillarGrid />
      </Container>

      <Container className="py-16 space-y-6">
        <h2 className="text-2xl font-black text-brand-navy text-center">چهار روز، چهار مرحله</h2>
        <PhaseTimeline phase={phase} endsAt={endsAt} />
      </Container>

      <Container className="py-16 space-y-6">
        <h2 className="text-2xl font-black text-brand-navy text-center">چطور برنده می‌شویم؟</h2>
        <p className="text-center text-brand-slate max-w-2xl mx-auto">
          امتیاز نهایی هر تیم از هشت معیار ساخته می‌شود؛ عدد جلوی هر معیار سهم آن از امتیاز کل است.
        </p>
        <div className="flex flex-wrap justify-center gap-3 stagger">
          {SCORE_ITEMS.map((k) => (
            <span key={k} className="chip-navy !text-sm !px-4 !py-2">
              {SCORE_CATEGORY_LABELS[k].emoji} {SCORE_CATEGORY_LABELS[k].label} <b className="fa-num mr-1">{fa(SCORE_WEIGHTS[k])}</b>
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
              <p className="mt-2 text-sm text-brand-slate">{typeof f.a === "function" ? f.a(values) : f.a}</p>
            </details>
          ))}
        </div>
      </Container>

      <Container className="pb-16">
        <p className="text-center text-xs text-brand-slate">
          میدان بنیان‌گذاران یک بازی شبیه‌سازی کسب‌وکار برای روز برنامه‌نویس {GROUP_NAME} است؛ سکه‌ها واقعی نیستند.
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
