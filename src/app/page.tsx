import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getPhase, PHASE_LABEL, PHASE_DESC } from "@/lib/phase";
import { SCORE_WEIGHTS, COIN_PRICE_TOMAN } from "@/lib/constants";
import { SCORE_CATEGORY_ORDER, SCORE_CATEGORY_LABELS } from "@/lib/score-labels";
import { formatPrizeAmount, type PrizeRow } from "@/lib/prizes";
import { listPrizes } from "@/lib/scoring";
import { CORE_RULES, ANTI_CHEAT_STATEMENT } from "@/lib/rules";
import { spendableBuyCoins } from "@/lib/market";
import { getModuleStatuses, statusVisible, MODULE_LABEL, type ModuleKey } from "@/lib/module-state";
import { ENTRY_CATEGORY_LABEL, NO_BAZAAR_WEIGHTS, TRACK_KIND_LABEL, listVisibleTracks, type EntryCategory, type TrackInfo } from "@/lib/track-data";
import { fa, coins } from "@/lib/persian";
import { smsEnabled } from "@/lib/sms";
import { Alert, Container, Stat } from "@/components/ui";
import { Avatar } from "@/components/Avatar";
import { prisma } from "@/lib/db";
import { PhaseCountdown } from "./PhaseCountdown";
import { OnboardingTour } from "@/components/OnboardingTour";
import { LiveFeed } from "@/components/LiveFeed";
import { PillarGrid } from "@/components/PillarLogos";
import { GROUP_NAME } from "@/lib/pillars";
import { getEffectiveGameValues, type GameValues } from "@/lib/game-values";
import { peopleExample } from "@/lib/people-example";

export default async function Home({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  // مقادیر مؤثر بازی (تنظیم برگزارکننده یا پیش‌فرض) برای متن‌های راهنما/سؤال‌های پرتکرار
  const [{ welcome }, user, { phase, endsAt }, values, tracks, allPrizes, modules] = await Promise.all([
    searchParams,
    getCurrentUser(),
    getPhase(),
    getEffectiveGameValues(),
    listVisibleTracks(),
    listPrizes(),
    getModuleStatuses(),
  ]);
  const trackById = new Map(tracks.map((t) => [t.id, t]));
  // جایزهٔ محور مخفی نباید پیش از باز شدن محور دیده شود.
  const prizes = allPrizes.filter((p) => trackById.has(p.trackId));
  const closed = phase === "CLOSED";

  if (!user) {
    return (
      <LoggedOutLanding
        closed={closed}
        statusLabel={PHASE_LABEL[phase]}
        endsAt={endsAt ? endsAt.toISOString() : null}
        values={values}
        tracks={tracks}
        prizes={prizes}
        registrationOpen={modules.registration === "open"}
      />
    );
  }

  const teamId = user.teamId;
  const [ideas, products, exceptions, spendable] = await Promise.all([
    teamId ? prisma.idea.findMany({ where: { teamId }, select: { trackId: true, submittedAt: true } }) : [],
    teamId ? prisma.product.findMany({ where: { teamId }, select: { trackId: true, submittedAt: true, liveStatus: true, slug: true } }) : [],
    teamId ? prisma.moduleException.findMany({ where: { teamId }, select: { moduleKey: true } }) : [],
    spendableBuyCoins(user.id, user.buyWallet),
  ]);
  const excepted = new Set(exceptions.map((e) => e.moduleKey));
  const isOpen = (key: ModuleKey) => modules[key] === "open" || excepted.has(key);
  const resultsVisible = statusVisible(modules.results) || excepted.has("results");
  const steps = tracks.map((track) => ({
    track,
    step: nextStepInTrack({
      track,
      hasTeam: !!teamId,
      idea: ideas.find((i) => i.trackId === track.id) ?? null,
      product: products.find((p) => p.trackId === track.id) ?? null,
      closed,
      isOpen,
      trackOpen: track.status === "open" || excepted.has(`track:${track.id}`),
    }),
  }));
  const spend = spendAction({ spendable, isOpen, closed, resultsVisible });
  const spendLinks: { href: string; label: string; key: ModuleKey }[] = [
    { href: "/market", label: "🛒 بازار", key: "market" },
    { href: "/auction", label: "🔨 حراج زنده", key: "market" },
    { href: "/adslots", label: "📣 جایگاه تبلیغاتی", key: "adslots" },
    { href: "/coins", label: "🪙 خرید سکه", key: "coins" },
  ];

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

      {smsEnabled() && !user.phone && !closed && (
        <Alert kind="info">
          شمارهٔ موبایلت ثبت نشده؛ با آن بدون رمز و با کد پیامکی وارد می‌شوی.{" "}
          <Link href="/profile#phone" className="font-bold underline underline-offset-2">
            ثبت کن
          </Link>
        </Alert>
      )}

      <div className="grid md:grid-cols-2 gap-4 stagger">
        <div className="card p-6 flex flex-col justify-between">
          <div>
            <div className="text-xs font-bold text-brand-cyan-dark mb-1">وضعیت مسابقه</div>
            <div className="text-xl font-black text-brand-navy">{PHASE_LABEL[phase]}</div>
            <p className="mt-1 text-sm text-brand-slate">{PHASE_DESC[phase]}</p>
          </div>
          {!closed && (
            <div className="mt-4 flex items-center justify-between">
              <span className="text-xs text-brand-slate">زمان باقی‌مانده تا ددلاین نهایی</span>
              <PhaseCountdown endsAt={endsAt ? endsAt.toISOString() : null} />
            </div>
          )}
        </div>

        <div className="card p-6 flex flex-col justify-between bg-brand-navy text-white">
          <div>
            <div className="text-xs font-bold text-brand-mist mb-1">{closed ? "پایان مسابقه" : "سکه‌هایت"}</div>
            <div className="text-lg sm:text-xl font-black leading-8">{spend.title}</div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {spend.href && (
              <Link href={spend.href} className="btn-primary">
                {spend.action} ←
              </Link>
            )}
            {!closed &&
              spendLinks
                .filter((x) => x.href !== spend.href && (statusVisible(modules[x.key]) || excepted.has(x.key)))
                .map((x) => (
                  <Link key={x.href} href={x.href} className="rounded-pill border border-white/30 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/10">
                    {x.label}
                  </Link>
                ))}
          </div>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-black text-brand-navy">قدم بعدی تیم تو در هر محور</h2>
        <p className="text-sm text-brand-slate">هر محور مسیر خودش را دارد و تیم با سرعت خودش جلو می‌رود: تیم، ایده، محصول، درخواست انتشار.</p>
        <div className="grid md:grid-cols-2 gap-4 stagger">
          {steps.map(({ track, step }) => (
            <TrackStepCard key={track.id} track={track} step={step} />
          ))}
        </div>
      </section>

      <div className="grid sm:grid-cols-2 gap-4 stagger">
        <Link href="/wallet" className="block hover:shadow-lift transition rounded-3xl">
          <Stat
            label="🪙 کیف سکه"
            value={coins(user.buyWallet)}
            hint={spendable < user.buyWallet ? `${coins(spendable)} قابل خرج (بقیه برای پیشنهاد حراج رزرو است)` : "برای حمایت، خرید، حراج و تبلیغ"}
            tone="gold"
          />
        </Link>
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
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-black text-brand-navy">جوایز</h2>
        <PrizeGrid prizes={prizes} trackById={trackById} />
      </section>

      <LiveFeed />
    </Container>
  );
}

type TrackStep = {
  title: string;
  /** null یعنی کاری برای انجام نیست یا این بخش فعلاً باز نیست. */
  href: string | null;
  action: string;
  /** وقتی قدم بعدی به بخشی می‌رسد که باز نیست */
  blocked?: string;
  progress: { label: string; done: boolean }[];
};

type TrackStepInput = {
  track: TrackInfo;
  hasTeam: boolean;
  idea: { submittedAt: Date | null } | null;
  product: { submittedAt: Date | null; liveStatus: string; slug: string } | null;
  closed: boolean;
  trackOpen: boolean;
  isOpen: (key: ModuleKey) => boolean;
};

/** فقط محور «ساخت محصول» روی بازار منتشر می‌شود. */
function publishesOnBazaar(track: TrackInfo) {
  return track.kind === "PRODUCT";
}

/** ترتیب داخلی هر تیم در یک محور: تیم، ایده، محصول، درخواست انتشار. قدم بعدی بر اساس وضعیت واقعی همان محور است. */
function nextStepInTrack(input: TrackStepInput): TrackStep {
  const { track, hasTeam, idea, product, closed, trackOpen, isOpen } = input;
  const ideaDone = !!idea?.submittedAt;
  const productDone = !!product?.submittedAt;
  const live = product?.liveStatus === "LIVE";
  const progress = [
    { label: "تیم", done: hasTeam },
    { label: "ایده", done: ideaDone },
    { label: "محصول", done: productDone },
    ...(publishesOnBazaar(track) ? [{ label: "انتشار", done: live }] : []),
  ];
  const q = `?track=${track.id}`;

  const gated = (key: ModuleKey, step: Omit<TrackStep, "progress" | "blocked">): TrackStep =>
    isOpen(key) ? { ...step, progress } : { ...step, href: null, blocked: `بخش «${MODULE_LABEL[key]}» فعلاً باز نیست.`, progress };

  if (closed) {
    return { title: productDone ? "محصولت در این محور ثبت شد." : "مسابقه تمام شد و محصولی در این محور ثبت نشد.", href: null, action: "", progress };
  }
  if (!hasTeam) return gated("team", { title: "اول تیم بساز، به تیمی بپیوند یا «شرکت فردی» را انتخاب کن.", href: "/team", action: "اتاق تیم" });
  if (!ideaDone && !trackOpen) return { title: "", href: null, action: "", blocked: "این محور فعلاً باز نیست.", progress };
  if (!idea) return gated("idea", { title: "هنوز ایده‌ای در این محور نداری.", href: `/idea${q}`, action: "ایده بده" });
  if (!ideaDone) return gated("idea", { title: "پیش‌نویس ایده‌ات آماده است؛ ثبت نهایی‌اش کن.", href: `/idea${q}`, action: "ثبت نهایی" });
  if (!product) return gated("build", { title: "ایده‌ات ثبت شد؛ حالا محصولت را بساز.", href: `/build${q}`, action: "بساز" });
  if (!productDone) return gated("build", { title: "محصولت هنوز ثبت نهایی نشده.", href: `/build${q}`, action: "ادامه بده" });

  const marketPage = `/market/${product.slug}`;
  if (!publishesOnBazaar(track)) return { title: "محصولت ثبت شد؛ حالا حمایت بگیر و صفحه‌اش را کامل نگه دار.", href: marketPage, action: "صفحهٔ محصول", progress };
  if (live) return { title: "محصولت روی بازار منتشر شده؛ حالا کاربر واقعی جذب کن.", href: marketPage, action: "صفحهٔ محصول", progress };
  if (product.liveStatus === "REQUESTED" || product.liveStatus === "PUBLISHING") {
    return { title: "درخواست انتشارت در دست بررسی است.", href: `/build${q}`, action: "وضعیت درخواست", progress };
  }
  return gated("studio", {
    title: product.liveStatus === "REJECTED" ? "درخواست انتشارت رد شد؛ اصلاحش کن و دوباره بفرست." : "محصولت ثبت شد؛ برای انتشار روی بازار درخواست بده.",
    href: `/build${q}`,
    action: "درخواست انتشار",
  });
}

/** کارت سکه: مهم‌ترین جایی که الان می‌شود سکه خرج کرد. */
function spendAction(input: { spendable: number; isOpen: (key: ModuleKey) => boolean; closed: boolean; resultsVisible: boolean }): {
  href: string | null;
  title: string;
  action: string;
} {
  const { spendable, isOpen, closed, resultsVisible } = input;
  if (closed) {
    return resultsVisible
      ? { href: "/results", title: "مسابقه تمام شد؛ امتیازها و برندگان جوایز را ببین.", action: "نتایج را ببین" }
      : { href: null, title: "مسابقه تمام شد. داوری و ارزیابی نهایی انجام می‌شود و نتایج به‌زودی اعلام می‌شود.", action: "" };
  }
  if (spendable <= 0) {
    return isOpen("coins")
      ? { href: "/coins", title: "سکه‌هایت را خرج کرده‌ای؛ اگر خواستی سکهٔ بیشتر بخر.", action: "خرید سکه" }
      : { href: null, title: "سکه‌هایت را خرج کرده‌ای.", action: "" };
  }
  if (isOpen("invest")) return { href: "/invest", title: `${coins(spendable)} قابل خرج داری؛ از ایده‌های تیم‌های دیگر حمایت کن.`, action: "حمایت کن" };
  if (isOpen("market")) return { href: "/market", title: `${coins(spendable)} قابل خرج داری؛ از محصولات دیگران بخر.`, action: "خرید کن" };
  return { href: null, title: `${coins(spendable)} قابل خرج داری.`, action: "" };
}

function TrackStepCard({ track, step }: { track: TrackInfo; step: TrackStep }) {
  return (
    <div className="card p-5 flex flex-col justify-between gap-3 anim-rise">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="font-black text-brand-navy">{track.name}</div>
          <ol className="flex flex-wrap gap-1 text-xs" aria-label="مسیر تیم در این محور">
            {step.progress.map((p) => (
              <li key={p.label} className={p.done ? "chip-ok !text-xs" : "chip-navy !text-xs opacity-60"}>
                {p.done && <span aria-hidden>✓ </span>}
                {p.label}
                {p.done && <span className="sr-only"> انجام شده</span>}
              </li>
            ))}
          </ol>
        </div>
        {step.title && <p className="mt-2 text-sm text-brand-navy leading-7">{step.title}</p>}
        {step.blocked && <p className="mt-1 text-xs text-brand-slate">{step.blocked}</p>}
      </div>
      {step.href && (
        <div>
          <Link href={step.href} className="btn-ghost inline-flex">
            {step.action} ←
          </Link>
        </div>
      )}
    </div>
  );
}

/** جوایز از همان ابتدا با مبلغ ثابت دیده می‌شوند. */
function PrizeGrid({ prizes, trackById }: { prizes: PrizeRow[]; trackById: Map<string, TrackInfo> }) {
  if (prizes.length === 0) return <p className="text-center text-sm text-brand-slate">فهرست جوایز به‌زودی اعلام می‌شود.</p>;
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 stagger">
      {prizes.map((p) => (
        <div key={p.id} className="card p-5 text-center">
          <div className="text-3xl mb-2" aria-hidden>{p.emoji}</div>
          <div className="font-black text-brand-navy">{p.label}</div>
          <div className="mt-1 text-sm font-black text-amber-700 fa-num">{formatPrizeAmount(p.amountToman)}</div>
          <p className="mt-1 text-xs text-brand-slate">
            {trackById.get(p.trackId)?.name}
            {p.category && ` · ${ENTRY_CATEGORY_LABEL[p.category as EntryCategory] ?? p.category}`}
            {p.kind === "SPECIAL" && " · جایزهٔ ویژه"}
          </p>
        </div>
      ))}
    </div>
  );
}

const SCORE_ITEMS = SCORE_CATEGORY_ORDER;

// پاسخ تابعی با مقادیر مؤثر بازی ساخته می‌شود
const FAQ: { q: string; a: string | ((v: GameValues) => string) }[] = [
  {
    q: "باید منتظر زمان خاصی بمانم؟",
    a: "نه. همه‌چیز از اول باز است و هر تیم با سرعت خودش جلو می‌رود. فقط ترتیب داخلی تیم حفظ می‌شود: تیم، ایده، محصول، درخواست انتشار. تنها زمان‌بندی، ددلاین نهایی مسابقه است.",
  },
  {
    q: "می‌توانم در چند محور شرکت کنم؟",
    a: "بله. هر تیم می‌تواند در چند محور با ایده و محصول جدا شرکت کند و هر محور جدول و جایزهٔ خودش را دارد.",
  },
  {
    q: "سکه از کجا می‌آید؟",
    a: (v) =>
      `هر نفر ${fa(v.startingCoins)} سکهٔ رایگان دارد و همهٔ کارهای بازی با همین یک کیف انجام می‌شود. اگر خواستی می‌توانی سکهٔ بیشتر بخری: هر سکه ${fa(COIN_PRICE_TOMAN)} تومان (حداکثر ${fa(v.maxBoughtCoinsPerUser)} سکه برای هر نفر).`,
  },
  {
    q: "با خرید سکهٔ بیشتر می‌شود برنده شد؟",
    a: (v) =>
      `نه به این سادگی. اثر هر نفر روی حمایت با سکه از یک پروژه حداکثر ${fa(v.supportCap)} سکه حساب می‌شود و تعداد حامی‌ها از مقدار سکه مهم‌تر است: ${peopleExample(v.supportCap)}`,
  },
  {
    q: "می‌توانم تنها شرکت کنم؟",
    a: "بله. تیم‌ها ۱ تا ۳ نفره‌اند و «شرکت فردی» هم مجاز است. تعداد اعضای تیم در امتیاز هیچ اثری ندارد.",
  },
  {
    q: "می‌توانم از تیم خودم حمایت کنم؟",
    a: "نه؛ حمایت از ایده یا خرید محصول تیم خودت مجاز نیست و سکهٔ اعضای هر تیم برای همان تیم حساب نمی‌شود.",
  },
  {
    q: "اگر ایده‌ای که حمایت کردم عوض شد چه؟",
    a: "تیم می‌تواند ایده‌اش را بعد از گرفتن حمایت ویرایش کند، ولی تاریخچهٔ تغییرات به حامی‌ها نشان داده می‌شود. حمایتی که پیش از آخرین ویرایش داده‌ای را می‌توانی پس بگیری و سکه‌اش کامل برمی‌گردد.",
  },
  {
    q: "حراج زنده چطور برگزار می‌شود؟",
    a: "حراج بخشی از بازار است. هر تیم می‌تواند نسخهٔ ویژهٔ محصولش را از صفحهٔ محصول به صف حراج بفرستد؛ حراج‌ها یکی‌یکی برگزار می‌شوند و بردن حراج یک خرید حساب می‌شود. اگر نزدیک پایان پیشنهادی ثبت شود، زمان حراج خودکار تمدید می‌شود.",
  },
  {
    q: "جایگاه‌های تبلیغاتی چطورند؟",
    a: (v) =>
      `مزایده‌ای‌اند. تا شروع هر بازه، هر کس پیشنهاد بالاتری بدهد جایگاه را می‌گیرد، حتی اگر دیرتر آمده باشد، و سکهٔ نفر قبلی کامل برمی‌گردد. هر تیم هم‌زمان حداکثر ${fa(v.adslotMaxPerTeam)} جایگاه در دست دارد. تبلیغ دیده‌شدن می‌آورد ولی مستقیم امتیاز نمی‌دهد.`,
  },
  {
    q: "با تقلب چه برخوردی می‌شود؟",
    a: ANTI_CHEAT_STATEMENT,
  },
];

function LoggedOutLanding({
  closed,
  statusLabel,
  endsAt,
  values,
  tracks,
  prizes,
  registrationOpen,
}: {
  closed: boolean;
  statusLabel: string;
  endsAt: string | null;
  values: GameValues;
  tracks: TrackInfo[];
  prizes: PrizeRow[];
  registrationOpen: boolean;
}) {
  const trackById = new Map(tracks.map((t) => [t.id, t]));
  return (
    <>
      <section className="bg-hero bg-dots relative overflow-hidden">
        <Container className="pt-16 pb-20 relative">
          <div className="grid lg:grid-cols-2 gap-10 items-center">
            <div className="anim-rise">
              <span className="chip-cyan mb-4">{statusLabel} · روز برنامه‌نویس {GROUP_NAME}</span>
              <h1 className="text-4xl md:text-5xl font-black text-brand-navy leading-[1.25]">
                میدان <span className="text-brand-red">بنیان‌گذاران</span>
              </h1>
              <p className="mt-4 text-lg text-brand-slate max-w-xl">
                یک مسابقهٔ {fa(values.contestDays)} روزهٔ استارتاپی برای همهٔ پیلارهای {GROUP_NAME}: تنها یا با یک تا دو هم‌تیمی محور خودت را
                انتخاب کن، ایده بده، حامی جذب کن، بساز و روی بازار منتشر کن. همه‌چیز از اول باز است و هر تیم با سرعت خودش جلو می‌رود.
              </p>
              {!closed && (
                <div className="mt-6 flex items-center gap-3">
                  <span className="text-xs text-brand-slate">زمان باقی‌مانده تا ددلاین نهایی</span>
                  <PhaseCountdown endsAt={endsAt} />
                </div>
              )}
              <div className="mt-8 flex flex-wrap gap-3">
                {registrationOpen && <Link href="/register" className="btn-primary">ثبت‌نام</Link>}
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
        <h2 className="text-2xl font-black text-brand-navy text-center">محورهای مسابقه</h2>
        <p className="text-center text-brand-slate max-w-2xl mx-auto">
          هر تیم می‌تواند در چند محور با ایده و محصول جدا شرکت کند و در هر محور این مسیر را به ترتیب و با سرعت خودش طی می‌کند: تیم، ایده، محصول،
          درخواست انتشار.
        </p>
        <div className="grid md:grid-cols-2 gap-4 stagger">
          {tracks.map((t) => (
            <div key={t.id} className="card p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-black text-brand-navy">{t.name}</div>
                <span className="chip-cyan !text-xs">{TRACK_KIND_LABEL[t.kind]}</span>
              </div>
              {t.description && <p className="mt-1 text-sm text-brand-slate">{t.description}</p>}
              {t.category === "MIXED" && <p className="mt-1 text-xs text-brand-slate">دو دستهٔ جدا: فنی و غیرفنی</p>}
            </div>
          ))}
        </div>
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
          امتیاز هر محصول از سه بخش ساخته می‌شود (جمع {fa(1000)}) و فقط با محصول‌های همان محور مقایسه می‌شود. هر محور وزن خودش را دارد؛ وزن پیش‌فرض این است:
        </p>
        <div className="flex flex-wrap justify-center gap-3 stagger">
          {SCORE_ITEMS.map((k) => (
            <span key={k} className="chip-navy !text-sm !px-4 !py-2">
              {SCORE_CATEGORY_LABELS[k].emoji} {SCORE_CATEGORY_LABELS[k].label} <b className="fa-num mr-1">{fa(SCORE_WEIGHTS[k])}</b>
            </span>
          ))}
        </div>
        <p className="text-center text-sm text-brand-slate max-w-2xl mx-auto fa-num">
          در محورهایی که روی بازار منتشر نمی‌شوند: هوش مصنوعی {fa(NO_BAZAAR_WEIGHTS.ai * 10)}، بازار (فقط حمایت با سکه) {fa(NO_BAZAAR_WEIGHTS.market * 10)} و داوری{" "}
          {fa(NO_BAZAAR_WEIGHTS.jury * 10)}. امتیاز هوش مصنوعی و بازار زنده دیده می‌شود و نمرهٔ داوری فقط در پایان.
        </p>
      </Container>

      <Container className="py-16 space-y-6">
        <h2 className="text-2xl font-black text-brand-navy text-center">جوایز</h2>
        <p className="text-center text-brand-slate max-w-2xl mx-auto">
          هر جایزه مبلغ ثابت دارد. هر محصول حداکثر یک جایزهٔ رتبه و یک جایزهٔ ویژه می‌برد.
        </p>
        <PrizeGrid prizes={prizes} trackById={trackById} />
      </Container>

      <Container className="py-16 space-y-6">
        <h2 className="text-2xl font-black text-brand-navy text-center">سؤال‌های پرتکرار</h2>
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
          میدان بنیان‌گذاران مسابقهٔ روز برنامه‌نویس {GROUP_NAME} است. سکه‌ها فقط داخل بازی خرج می‌شوند.
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
