import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getPhase, phaseIndex, PHASE_LABEL, PHASE_DESC, type Phase } from "@/lib/phase";
import { SCORE_WEIGHTS, COIN_PRICE_TOMAN } from "@/lib/constants";
import { SCORE_CATEGORY_ORDER, SCORE_CATEGORY_LABELS } from "@/lib/score-labels";
import { PRIZES, prizeAmountMillion, formatMillion, type PrizePool } from "@/lib/prizes";
import { getPrizePoolCached } from "@/lib/prize-pool";
import { CORE_RULES, ANTI_CHEAT_STATEMENT } from "@/lib/rules";
import { spendableBuyCoins } from "@/lib/market";
import { fa, coins, duration } from "@/lib/persian";
import { smsEnabled } from "@/lib/sms";
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
  const [{ welcome }, user, { phase, endsAt }, values, pool] = await Promise.all([
    searchParams,
    getCurrentUser(),
    getPhase(),
    getEffectiveGameValues(),
    getPrizePoolCached(),
  ]);

  if (!user) {
    return <LoggedOutLanding phase={phase} endsAt={endsAt ? endsAt.toISOString() : null} values={values} pool={pool} />;
  }

  // فقط داده‌های سبکی که برای تشخیص «کار بعدی» لازم است
  const teamId = user.teamId;
  const spendPhase = phase === "SEED_ROUND" || phase === "MARKET";
  const [idea, product, memberCount, spendable, liveAuction] = await Promise.all([
    teamId && phase === "IDEATION"
      ? prisma.idea.findUnique({ where: { teamId }, select: { submittedAt: true } })
      : null,
    teamId && (phase === "BUILD" || phase === "MARKET")
      ? prisma.product.findUnique({ where: { teamId }, select: { submittedAt: true, auction: { select: { id: true } } } })
      : null,
    teamId ? prisma.user.count({ where: { teamId } }) : 0,
    spendPhase ? spendableBuyCoins(user.id, user.buyWallet) : user.buyWallet,
    phase === "MARKET" ? prisma.auction.findFirst({ where: { status: "LIVE" }, select: { id: true } }) : null,
  ]);
  const cta = nextAction({
    phase,
    endsAt,
    team: user.team ? { slug: user.team.slug, solo: user.team.solo, size: memberCount } : null,
    spendable,
    ideaSubmitted: !!idea?.submittedAt,
    productSubmitted: !!product?.submittedAt,
    productQueued: !!product?.auction,
    auctionLive: !!liveAuction,
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
          <OnboardingTour autoOpen={welcome === "1"} values={values} />
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
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Link href={cta.href} className="btn-primary">
                {cta.action} ←
              </Link>
              {cta.extra?.map((x) => (
                <Link
                  key={x.href + x.label}
                  href={x.href}
                  className="rounded-pill border border-white/30 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/10"
                >
                  {x.label}
                </Link>
              ))}
            </div>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4 stagger">
          <Link href="/wallet" className="block hover:shadow-lift transition rounded-3xl">
            <Stat
              label="🪙 کیف سکه"
              value={coins(user.buyWallet)}
              hint={spendable < user.buyWallet ? `${coins(spendable)} قابل خرج (بقیه برای پیشنهاد حراج رزرو است)` : "برای حمایت، خرید، حراج و تبلیغ"}
              tone="gold"
            />
          </Link>
          <Link href="/coins" className="block hover:shadow-lift transition rounded-3xl">
            <Stat
              label="🏆 صندوق جایزه"
              value={`${million(pool.totalMillion)} میلیون تومان`}
              hint="با هر خرید سکه بزرگ‌تر می‌شود · خرید سکه ←"
              tone="navy"
            />
          </Link>
        </div>

        <PhaseTimeline phase={phase} endsAt={endsAt ? endsAt.toISOString() : null} />

        <LiveFeed />

        {user.team ? (
          <Link href="/team" className="card p-5 flex items-center justify-between gap-3 hover:shadow-lift transition anim-rise">
            <div className="flex items-center gap-3 min-w-0">
              <Avatar seed={user.team.logoSeed || user.team.id} size={40} className="shrink-0" />
              <div className="min-w-0">
                <div className="font-black text-brand-navy truncate">{user.team.name}</div>
                <div className="text-xs text-brand-slate">{user.team.solo ? "شرکت فردی · اتاق تیم را ببین" : "اتاق تیم را ببین"}</div>
              </div>
            </div>
            <span className="text-brand-cyan-dark font-bold shrink-0">←</span>
          </Link>
        ) : (
          <Link href="/team" className="card p-5 flex items-center justify-between gap-3 hover:shadow-lift transition anim-rise bg-brand-ice">
            <div className="font-black text-brand-navy">هنوز تیم نداری؛ تیم بساز، بپیوند یا فردی شرکت کن</div>
            <span className="text-brand-cyan-dark font-bold shrink-0 whitespace-nowrap">اتاق تیم ←</span>
          </Link>
        )}
      </Container>
  );
}

const TEAM_FULL = 3;

type Cta = { href: string; title: string; action: string; extra?: { href: string; label: string }[] };

type NextActionInput = {
  phase: Phase;
  endsAt: Date | null;
  team: { slug: string; solo: boolean; size: number } | null;
  /** سکهٔ قابل‌خرج (موجودی منهای رزرو حراج) */
  spendable: number;
  ideaSubmitted: boolean;
  productSubmitted: boolean;
  /** محصول تیم در صف حراج است (یا حراجش برگزار شده) */
  productQueued: boolean;
  auctionLive: boolean;
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
 * extra چند میان‌بُر اختیاری کنار دکمهٔ اصلی است.
 */
function nextAction(input: NextActionInput): Cta {
  const { phase, endsAt, team, spendable, ideaSubmitted, productSubmitted, productQueued, auctionLive, needsPhone } = input;
  if (phase === "CLOSED") return { href: "/results", title: "بازی تمام شد؛ امتیازها و برندگان جوایز را ببین.", action: "نتایج را ببین" };

  const formingOpen = phaseIndex(phase) <= phaseIndex("IDEATION");
  if (!team && formingOpen) {
    return {
      href: "/team",
      title: `هنوز تیم نداری${timeLeft(endsAt, "این فاز")}؛ تیم ۲ یا ۳ نفره بساز، به تیمی بپیوند یا «شرکت فردی» را انتخاب کن.`,
      action: "اتاق تیم",
    };
  }

  switch (phase) {
    case "REGISTRATION": {
      if (needsPhone) {
        return { href: "/profile#phone", title: "شمارهٔ موبایلت ثبت نشده؛ با آن بدون رمز و با کد پیامکی وارد می‌شوی.", action: "ثبت کن" };
      }
      if (team && !team.solo && team.size < TEAM_FULL) {
        return {
          href: "/team",
          title: `تیمت ${fa(team.size)} نفره است؛ اگر خواستی تا پایان «اتاق ایده» هم‌تیمی دعوت کن (تیم‌ها ۱ تا ۳ نفره‌اند).`,
          action: "اتاق تیم",
        };
      }
      return { href: "/guide", title: `آماده‌ای${timeLeft(endsAt, "ثبت‌نام")}؛ تا شروع «اتاق ایده» قوانین کوتاه بازی را مرور کن.`, action: "راهنما" };
    }
    case "IDEATION":
      return ideaSubmitted
        ? { href: "/idea", title: `ایدهٔ تیمت ثبت شده${timeLeft(endsAt, "اتاق ایده")}.`, action: "بازبینی کن" }
        : { href: "/idea", title: `ایدهٔ تیمت هنوز ثبت نشده${timeLeft(endsAt, "اتاق ایده")}.`, action: "ایده را ثبت کن" };
    case "SEED_ROUND":
      return spendable > 0
        ? {
            href: "/invest",
            title: `${coins(spendable)} در کیفت داری${timeLeft(endsAt, "دور حمایت")}؛ از ایده‌های دیگران حمایت کن.`,
            action: "حمایت کن",
          }
        : { href: "/coins", title: "سکه‌هایت را خرج کرده‌ای؛ اگر خواستی سکهٔ بیشتر بخر و از ایده‌های بیشتری حمایت کن.", action: "خرید سکه" };
    case "BUILD":
      if (!team) {
        return { href: "/market", title: "تیمی نداری؛ محصولات در حال ساخت را ببین و برای خرید در «روز بازار» آماده شو.", action: "بازار را ببین" };
      }
      return productSubmitted
        ? {
            href: "/build",
            title: `محصول تیمت ثبت شده${timeLeft(endsAt, "ساخت")}؛ اگر خواستی انتشار لایو یا جایگاه تبلیغاتی هم بگیر.`,
            action: "بهترش کن",
            extra: [
              { href: "/build", label: "🚀 انتشار لایو" },
              { href: "/adslots", label: "📣 جایگاه تبلیغاتی" },
            ],
          }
        : { href: "/build", title: `محصول تیمت هنوز ثبت نشده${timeLeft(endsAt, "ساخت")}.`, action: "بساز" };
    case "MARKET": {
      const extra: Cta["extra"] = [];
      if (team && productSubmitted && !productQueued) extra.push({ href: `/market/${team.slug}`, label: "📤 محصولت را به حراج بفرست" });
      if (!auctionLive) extra.push({ href: "/auction", label: "🔨 حراج زنده" });
      if (team && productSubmitted) extra.push({ href: "/adslots", label: "📣 تبلیغ" });
      if (auctionLive) {
        return {
          href: "/auction",
          title: spendable > 0 ? `حراج زنده در جریان است و ${coins(spendable)} قابل خرج داری.` : "حراج زنده در جریان است.",
          action: spendable > 0 ? "پیشنهاد بده" : "تماشا کن",
          extra,
        };
      }
      return spendable > 0
        ? { href: "/market", title: `${coins(spendable)} در کیفت داری${timeLeft(endsAt, "روز بازار")}؛ از محصولات دیگران بخر.`, action: "خرید کن", extra }
        : { href: "/coins", title: "سکه‌هایت را خرج کرده‌ای؛ اگر خواستی سکهٔ بیشتر بخر.", action: "خرید سکه", extra };
    }
    default:
      return { href: "/team", title: "اتاق تیم منتظر توست.", action: "سر بزن" };
  }
}

/** مبلغ میلیونی با ارقام فارسی (عدد صحیح با جداکنندهٔ هزارگان) */
function million(n: number) {
  const s = formatMillion(n);
  return s.includes(".") ? fa(s) : fa(Number(s));
}

const SCORE_ITEMS = SCORE_CATEGORY_ORDER;

// پاسخ تابعی با مقادیر مؤثر بازی ساخته می‌شود
const FAQ: { q: string; a: string | ((v: GameValues) => string) }[] = [
  {
    q: "سکه از کجا می‌آید؟",
    a: (v) =>
      `هر نفر ${fa(v.startingCoins)} سکهٔ رایگان دارد و همهٔ کارهای بازی با همین یک کیف انجام می‌شود. اگر خواستی می‌توانی سکهٔ بیشتر بخری: هر سکه ${fa(COIN_PRICE_TOMAN)} تومان (حداکثر ${fa(v.maxBoughtCoinsPerUser)} سکه برای هر نفر). همهٔ پول خرید سکه به صندوق جایزه اضافه می‌شود.`,
  },
  {
    q: "با خرید سکهٔ بیشتر می‌شود برنده شد؟",
    a: (v) =>
      `نه به این سادگی. اثر هر نفر روی امتیاز مردمی یک پروژه حداکثر ${fa(v.supportCap)} سکه حساب می‌شود و تعداد حامی‌ها از مقدار سکه مهم‌تر است: ۱۰ نفر که هر کدام ۱۰ سکه بدهند، ۱۰ برابرِ یک نفر با ۱۰۰ سکه می‌ارزند.`,
  },
  {
    q: "می‌توانم تنها شرکت کنم؟",
    a: (v) =>
      `بله. تیم‌ها ۱ تا ۳ نفره‌اند و «شرکت فردی» هم مجاز است. تیم کوچک‌تر در نمرهٔ داوری انسانی جبران می‌گیرد: فردی ${fa(v.soloBoostPct)}٪ و دونفره ${fa(v.duoBoostPct)}٪.`,
  },
  {
    q: "می‌توانم از تیم خودم حمایت کنم؟",
    a: "نه؛ حمایت از ایده یا خرید محصول تیم خودت مجاز نیست. از ایده‌ها و محصولات دیگران حمایت کن؛ اعضای هر تیم در امتیاز مردمی همان تیم حساب نمی‌شوند.",
  },
  {
    q: "حراج زنده کی و چطور برگزار می‌شود؟",
    a: "در «روز بازار». هر تیم می‌تواند نسخهٔ ویژهٔ محصولش را از صفحهٔ محصول به صف حراج بفرستد؛ حراج‌ها یکی‌یکی برگزار می‌شوند و بردن حراج یک خرید حساب می‌شود. اگر نزدیک پایان پیشنهادی ثبت شود، زمان حراج خودکار تمدید می‌شود.",
  },
  {
    q: "جایگاه‌های تبلیغاتی چطورند؟",
    a: (v) =>
      `در «ساخت محصول» و «روز بازار» هر تیمی که محصولش را ثبت کرده می‌تواند ساعت‌های تبلیغ را با قیمت ثابت سکه‌ای بخرد (هر کس زودتر بخرد، مال اوست؛ حداکثر ${fa(v.adslotMaxPerTeam)} ساعت برای هر تیم). تبلیغ دیده‌شدن می‌آورد ولی مستقیم امتیاز نمی‌دهد.`,
  },
  {
    q: "با تقلب چه برخوردی می‌شود؟",
    a: ANTI_CHEAT_STATEMENT,
  },
];

function LoggedOutLanding({ phase, endsAt, values, pool }: { phase: Phase; endsAt: string | null; values: GameValues; pool: PrizePool }) {
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
                یک بازار استارتاپی چهارروزه برای همهٔ پیلارهای {GROUP_NAME}: تنها یا با یک تا دو هم‌تیمی ایده بده، حامی جذب کن، در ۴۸ ساعت
                بساز و در روز بازار و حراج زنده بفروش.
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
        <h2 className="text-2xl font-black text-brand-navy text-center">مسیر بازی</h2>
        <PhaseTimeline phase={phase} endsAt={endsAt} />
      </Container>

      <Container className="py-16 space-y-6">
        <h2 className="text-2xl font-black text-brand-navy text-center">قانون‌ها در چند خط</h2>
        <ul className="max-w-2xl mx-auto space-y-2 stagger">
          {CORE_RULES.map((r) => (
            <li key={r} className="card px-4 py-3 text-sm text-brand-navy leading-7">
              {r}
            </li>
          ))}
        </ul>
      </Container>

      <Container className="py-16 space-y-6">
        <h2 className="text-2xl font-black text-brand-navy text-center">چطور برنده می‌شویم؟</h2>
        <p className="text-center text-brand-slate max-w-2xl mx-auto">
          امتیاز نهایی هر پروژه از سه معیار ساخته می‌شود (جمع {fa(1000)})؛ عدد جلوی هر معیار سهم آن از امتیاز کل است.
        </p>
        <div className="flex flex-wrap justify-center gap-3 stagger">
          {SCORE_ITEMS.map((k) => (
            <span key={k} className="chip-navy !text-sm !px-4 !py-2">
              {SCORE_CATEGORY_LABELS[k].emoji} {SCORE_CATEGORY_LABELS[k].label} <b className="fa-num mr-1">{fa(SCORE_WEIGHTS[k])}</b>
            </span>
          ))}
        </div>
      </Container>

      <Container className="py-16 space-y-6">
        <h2 className="text-2xl font-black text-brand-navy text-center">جوایز</h2>
        <p className="text-center text-brand-slate max-w-2xl mx-auto">
          صندوق جایزه <b className="fa-num text-brand-navy">{million(pool.totalMillion)}</b> میلیون تومان است و با هر خرید سکه بزرگ‌تر
          می‌شود. هر پروژه حداکثر یک جایزه می‌برد.
        </p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4 stagger">
          {PRIZES.map((p) => (
            <div key={p.key} className="card p-5 text-center">
              <div className="text-3xl mb-2" aria-hidden>{p.emoji}</div>
              <div className="font-black text-brand-navy">{p.label}</div>
              <div className="mt-1 text-sm font-black text-amber-600 fa-num">{million(prizeAmountMillion(pool, p.sharePct))} میلیون تومان</div>
              <p className="mt-1 text-xs text-brand-slate">{p.criterion}</p>
            </div>
          ))}
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
          میدان بنیان‌گذاران یک بازی شبیه‌سازی کسب‌وکار برای روز برنامه‌نویس {GROUP_NAME} است؛ سکه‌ها فقط داخل بازی خرج می‌شوند و پول
          خرید سکه به صندوق جایزه می‌رود.
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
