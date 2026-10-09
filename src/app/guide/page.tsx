import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getPhase, PHASES, PHASE_LABEL, PHASE_DESC, type Phase } from "@/lib/phase";
import { DEFAULTS, SCORE_WEIGHTS, AD_SLOT_KINDS, COIN_PRICE_TOMAN } from "@/lib/constants";
import { SCORE_CATEGORY_LABELS } from "@/lib/score-labels";
import { AI_TAG_LABEL } from "@/lib/ai-tag";
import { PRIZES, PRIZE_POOL_BASE_MILLION_TOMAN, prizeAmountMillion, formatMillion, type PrizePool } from "@/lib/prizes";
import { getPrizePoolCached } from "@/lib/prize-pool";
import { CORE_RULES, ANTI_CHEAT_STATEMENT } from "@/lib/rules";
import { getEffectiveGameValues, type GameValues } from "@/lib/game-values";
import { fa, coins } from "@/lib/persian";
import { Container } from "@/components/ui";

export const metadata = { title: "راهنمای بازی" };

const TOC: { id: string; label: string; emoji: string }[] = [
  { id: "overview", label: "خلاصهٔ بازی", emoji: "🗺️" },
  { id: "timeline", label: "مرحله‌ها", emoji: "⏳" },
  { id: "teams", label: "تیم", emoji: "👥" },
  { id: "coins", label: "سکه", emoji: "🪙" },
  { id: "spend", label: "خرج سکه", emoji: "🛍️" },
  { id: "scoring", label: "امتیازدهی", emoji: "📊" },
  { id: "studio", label: "بازار استودیو", emoji: "🚀" },
  { id: "awards", label: "جوایز", emoji: "🏆" },
  { id: "rules", label: "قوانین", emoji: "⚖️" },
  { id: "login", label: "ورود", emoji: "🔑" },
  { id: "faq", label: "سؤالات متداول", emoji: "❓" },
];

/** سه پرسش داوری انسانی (هر کدام ۰ تا ۱۰) */
const JURY_QUESTIONS = ["آیا واقعاً کار می‌کند؟", "ارزش واقعی برای کاربر یا گروه پگاه", "تیزر و ارائه"];

const PEOPLE_SLOGAN = "۱۰ نفر که هر کدام ۱۰ سکه بدهند، ۱۰ برابرِ یک نفر با ۱۰۰ سکه می‌ارزند.";

/** مبلغ میلیونی با رقم فارسی، جداکنندهٔ هزارگان و ممیز فارسی */
function million(n: number): string {
  return fa(Number(formatMillion(n))).replace(".", "٫");
}

export default async function GuidePage() {
  // مقادیر مؤثر (تنظیم برگزارکننده یا پیش‌فرض) و صندوق جایزهٔ زنده — همان اعدادی که بازی اعمال می‌کند
  const [user, { phase }, values, pool] = await Promise.all([
    getCurrentUser(),
    getPhase(),
    getEffectiveGameValues(),
    getPrizePoolCached(),
  ]);

  return (
    <>
      <Hero />
      <Container className="space-y-6">
        <MobileToc />
        <div className="grid lg:grid-cols-[260px_1fr] gap-8 items-start">
          <DesktopToc />
          <div className="space-y-6 min-w-0">
            <OverviewSection />
            <TimelineSection phase={user ? phase : null} />
            <TeamsSection />
            <CoinsSection values={values} />
            <SpendSection values={values} />
            <ScoringSection values={values} />
            <StudioSection />
            <AwardsSection pool={pool} />
            <RulesSection />
            <LoginSection />
            <FaqSection values={values} />
            <BottomCta loggedIn={!!user} />
          </div>
        </div>
      </Container>
    </>
  );
}

function Hero() {
  return (
    <section className="bg-hero bg-dots relative overflow-hidden">
      <Container className="pt-14 pb-10 relative">
        <div className="anim-rise max-w-3xl">
          <span className="chip-cyan mb-4">راهنما</span>
          <h1 className="text-3xl md:text-4xl font-black text-brand-navy leading-[1.3]">راهنمای بازی</h1>
          <p className="mt-3 text-lg text-brand-slate">
            میدان بنیان‌گذاران یک بازی استارتاپی برای همهٔ پیلارهای گروه پگاه است: تنها یا با یک تا دو هم‌تیمی ایده می‌دهی، محصول
            می‌سازی و در روز بازار عرضه‌اش می‌کنی. همه‌چیز با سکه است و همهٔ قوانین در چند دقیقه خوانده می‌شود.
          </p>
        </div>
      </Container>
    </section>
  );
}

function MobileToc() {
  return (
    <div className="lg:hidden -mx-4 px-4 overflow-x-auto">
      <div className="flex gap-2 w-max pb-1">
        {TOC.map((t) => (
          <a key={t.id} href={`#${t.id}`} className="chip-navy !text-sm !px-3.5 !py-1.5 whitespace-nowrap shrink-0">
            {t.emoji} {t.label}
          </a>
        ))}
      </div>
    </div>
  );
}

function DesktopToc() {
  return (
    <aside className="hidden lg:block sticky top-32 self-start">
      <nav className="card p-3" aria-label="فهرست راهنما">
        <div className="px-2 py-1.5 text-xs font-bold text-brand-slate">فهرست راهنما</div>
        <ul className="space-y-0.5">
          {TOC.map((t) => (
            <li key={t.id}>
              <a href={`#${t.id}`} className="flex items-center gap-2 rounded-2xl px-3 py-2 text-sm font-bold text-brand-navy hover:bg-brand-ice transition">
                <span aria-hidden>{t.emoji}</span>
                <span>{t.label}</span>
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}

function Section({ id, emoji, title, desc, children }: { id: string; emoji: string; title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="card p-4 sm:p-6 md:p-8 anim-rise scroll-mt-20 lg:scroll-mt-32">
      <div className="flex items-start gap-3 mb-4">
        <div className="text-3xl leading-none" aria-hidden>{emoji}</div>
        <div>
          <h2 className="text-xl md:text-2xl font-black text-brand-navy">{title}</h2>
          {desc && <p className="mt-1 text-sm text-brand-slate">{desc}</p>}
        </div>
      </div>
      <div className="space-y-3 text-sm md:text-[15px] text-brand-navy/90 leading-7">{children}</div>
    </section>
  );
}

function List({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="space-y-1.5 list-disc pr-5 marker:text-brand-cyan-dark">
      {items.map((it, i) => (
        <li key={i}>{it}</li>
      ))}
    </ul>
  );
}

function Box({ emoji, title, children, id }: { emoji: string; title: React.ReactNode; children: React.ReactNode; id?: string }) {
  return (
    <div id={id} className="rounded-2xl border border-brand-mist p-4 scroll-mt-20 lg:scroll-mt-32">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-xl" aria-hidden>{emoji}</span>
        <span className="font-black text-brand-navy">{title}</span>
      </div>
      <div className="text-xs sm:text-sm text-brand-slate leading-6 space-y-1.5">{children}</div>
    </div>
  );
}

function OverviewSection() {
  return (
    <Section id="overview" emoji="🗺️" title="خلاصهٔ بازی">
      <List
        items={[
          "تنها («شرکت فردی») یا در تیم ۲ یا ۳ نفره یک استارتاپ کوچک می‌سازی.",
          "یک کیف سکه داری؛ با آن از ایده‌ها حمایت می‌کنی، محصول می‌خری، در حراج شرکت می‌کنی و جایگاه تبلیغاتی می‌خری.",
          <>
            امتیاز نهایی فقط از سه جا می‌آید: <b>داوری انسانی</b>، <b>حمایت مردمی</b> و <b>داوری هوش مصنوعی</b>.
          </>,
          "پول خرید سکه به صندوق جایزه اضافه می‌شود؛ پنج جایزه از همین صندوق پرداخت می‌شود.",
        ]}
      />
    </Section>
  );
}

const PHASE_EMOJI: Record<Phase, string> = {
  REGISTRATION: "📝",
  IDEATION: "💡",
  SEED_ROUND: "🤝",
  BUILD: "🛠️",
  MARKET: "🛒",
  CLOSED: "🏁",
};

function TimelineSection({ phase }: { phase: Phase | null }) {
  return (
    <Section id="timeline" emoji="⏳" title="مرحله‌ها" desc="مرحله‌ها یکی پس از دیگری می‌آیند؛ با تمام شدن هر مرحله، صفحه‌های آن فقط‌خواندنی می‌شوند.">
      <ol className="relative border-r-2 border-brand-mist pr-6 space-y-4">
        {PHASES.map((p) => {
          const current = phase === p;
          return (
            <li key={p} className="relative" aria-current={current ? "step" : undefined}>
              <span
                className={`absolute right-[-31px] top-1.5 size-4 rounded-full border-2 ${
                  current ? "bg-brand-red border-brand-red" : "bg-white border-brand-mist"
                }`}
                aria-hidden
              />
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-lg" aria-hidden>{PHASE_EMOJI[p]}</span>
                <span className={`font-black ${current ? "text-brand-red" : "text-brand-navy"}`}>{PHASE_LABEL[p]}:</span>
                <span className="text-sm text-brand-slate">{PHASE_DESC[p]}</span>
                {current && <span className="chip-red !text-[11px]">مرحلهٔ فعلی</span>}
              </div>
            </li>
          );
        })}
      </ol>
      <p className="text-xs text-brand-slate">حراج زنده مرحلهٔ جدایی نیست؛ در همان «{PHASE_LABEL.MARKET}» برگزار می‌شود.</p>
      {!phase && <p className="text-xs text-brand-slate">برای دیدن مرحلهٔ فعلی، وارد حساب کاربری‌ات شو.</p>}
    </Section>
  );
}

function TeamsSection() {
  return (
    <Section id="teams" emoji="👥" title="تیم" desc="تیم ۱ تا ۳ نفره است و همهٔ اعضا برابرند.">
      <List
        items={[
          <>
            <b>شرکت فردی:</b> اگر دوست داری تنها بازی کنی، از «اتاق تیم» شرکت فردی بساز؛ تیم یک‌نفره‌ای که هم‌تیمی تازه نمی‌پذیرد.
          </>,
          "یا تیم بساز و یک یا دو هم‌تیمی دعوت کن، یا به تیمی که جای خالی دارد بپیوند.",
          "هر عضو می‌تواند ایده، محصول، حراج، جایگاه تبلیغاتی و درخواست انتشار تیم را ثبت کند.",
          "مهارتی که در پروفایل انتخاب می‌کنی (سازنده، قصه‌گو، معامله‌گر) فقط یک برچسب است و در امتیاز اثری ندارد.",
          <>
            <b>تعداد اعضای تیم در امتیاز هیچ اثری ندارد.</b> شرکت فردی، تیم دونفره و تیم سه‌نفره با همان معیارها امتیاز می‌گیرند.
          </>,
        ]}
      />
    </Section>
  );
}

function CoinsSection({ values }: { values: GameValues }) {
  return (
    <Section id="coins" emoji="🪙" title="سکه" desc="یک «کیف سکه» برای همه‌چیز.">
      <div className="grid sm:grid-cols-3 gap-3">
        <Box emoji="🎁" title="سکهٔ رایگان اولیه">
          <div className="text-2xl font-black text-brand-cyan-dark fa-num">{coins(values.startingCoins)}</div>
          <p>برای هر نفر، از همان ابتدای بازی.</p>
        </Box>
        <Box emoji="💳" title="خرید سکهٔ بیشتر">
          <div className="text-2xl font-black text-brand-red fa-num">{fa(COIN_PRICE_TOMAN)} تومان</div>
          <p>
            قیمت هر سکه؛ حداقل {fa(DEFAULTS.minCoinPurchase)} و حداکثر {fa(values.maxBoughtCoinsPerUser)} سکه برای هر نفر در کل بازی.
          </p>
        </Box>
        <Box emoji="🏆" title="صندوق جایزه">
          <div className="text-lg font-black text-brand-navy">بزرگ‌تر می‌شود</div>
          <p>همهٔ پولی که برای خرید سکه پرداخت می‌شود به صندوق جایزه اضافه می‌شود.</p>
        </Box>
      </div>
      <Link href="/coins" className="btn-ghost inline-flex">🪙 خرید سکه ←</Link>
    </Section>
  );
}

function SpendSection({ values }: { values: GameValues }) {
  return (
    <Section id="spend" emoji="🛍️" title="سکه را کجا خرج کنی؟" desc="همه از همان یک کیف سکه؛ حمایت از ایده یا خرید از محصول تیم خودت ممنوع است.">
      <div className="grid sm:grid-cols-2 gap-3">
        <Box id="invest" emoji="🤝" title={`حمایت از ایده‌ها (${PHASE_LABEL.SEED_ROUND})`}>
          <p>از ایده‌های تیم‌های دیگر با هر مقدار سکه که دوست داری حمایت کن؛ حتی اگر تیم نداشته باشی.</p>
          <Link href="/invest" className="font-bold text-brand-cyan-dark hover:underline">ایده‌ها ←</Link>
        </Box>
        <Box id="market" emoji="🛒" title={`خرید محصول (${PHASE_LABEL.MARKET})`}>
          <p>
            محصول تیم‌های دیگر را با قیمت کامل بخر. قیمت هر محصول را تیمش بین {fa(DEFAULTS.minPrice)} تا {fa(DEFAULTS.maxPrice)} سکه
            تعیین می‌کند.
          </p>
          <Link href="/market" className="font-bold text-brand-cyan-dark hover:underline">بازار ←</Link>
        </Box>
        <Box id="auction" emoji="🔨" title={`حراج زنده (${PHASE_LABEL.MARKET})`}>
          <p>
            هر تیم در روز بازار نسخهٔ ویژهٔ محصولش را به صف حراج می‌فرستد (تا {fa(DEFAULTS.auctionEnqueueCutoffMin)} دقیقه پیش از پایان
            روز بازار). حراج‌ها یکی‌یکی و به ترتیب صف زنده می‌شوند.
          </p>
          <p>
            هر پیشنهاد دست‌کم {fa(values.bidIncrement)} سکه بیشتر از بالاترین پیشنهاد است و پیشنهاد در {fa(DEFAULTS.antiSnipeWindowSec)}{" "}
            ثانیهٔ آخر، حراج را {fa(DEFAULTS.antiSnipeExtendSec)} ثانیه تمدید می‌کند. برنده همان مبلغ پیشنهادش را می‌پردازد و برد حراج
            یک خرید حساب می‌شود.
          </p>
          <Link href="/auction" className="font-bold text-brand-cyan-dark hover:underline">حراج ←</Link>
        </Box>
        <Box id="adslots" emoji="📣" title={`جایگاه تبلیغاتی (${PHASE_LABEL.BUILD} و ${PHASE_LABEL.MARKET})`}>
          <p>
            ساعت‌های روز بازار با قیمت ثابت فروخته می‌شوند؛ هر کس زودتر بخرد مال اوست: {AD_SLOT_KINDS.BANNER.label}{" "}
            {coins(values.adslotPriceBanner)}، {AD_SLOT_KINDS.FEATURED.label} {coins(values.adslotPriceFeatured)}،{" "}
            {AD_SLOT_KINDS.PUSH.label} {coins(values.adslotPricePush)}.
          </p>
          <p>
            هر تیم حداکثر {fa(values.adslotMaxPerTeam)} جایگاه، فقط پس از ثبت نهایی محصول. جایگاه فقط دیده‌شدن را بیشتر می‌کند و
            در امتیاز اثری ندارد.
          </p>
          <Link href="/adslots" className="font-bold text-brand-cyan-dark hover:underline">جایگاه‌ها ←</Link>
        </Box>
      </div>
    </Section>
  );
}

function ScoringSection({ values }: { values: GameValues }) {
  const total = SCORE_WEIGHTS.jury + SCORE_WEIGHTS.people + SCORE_WEIGHTS.ai;
  return (
    <Section
      id="scoring"
      emoji="📊"
      title="امتیازدهی"
      desc={`امتیاز نهایی از سه معیار جمع می‌شود (جمعاً ${fa(total)})؛ هر معیار نسبت به بهترین پروژهٔ همان معیار سنجیده می‌شود.`}
    >
      <div className="grid md:grid-cols-3 gap-3">
        <Box emoji={SCORE_CATEGORY_LABELS.jury.emoji} title={<ScoreTitle label={SCORE_CATEGORY_LABELS.jury.label} weight={SCORE_WEIGHTS.jury} />}>
          <p>داوران دمو را اجرا می‌کنند و به این سه پرسش از ۰ تا ۱۰ نمره می‌دهند:</p>
          <ol className="list-decimal pr-5 space-y-0.5 text-brand-navy">
            {JURY_QUESTIONS.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ol>
          <p>تعداد اعضای تیم در امتیاز هیچ اثری ندارد.</p>
        </Box>
        <Box emoji={SCORE_CATEGORY_LABELS.people.emoji} title={<ScoreTitle label={SCORE_CATEGORY_LABELS.people.label} weight={SCORE_WEIGHTS.people} />}>
          <p>هر سکه‌ای که دیگران با حمایت از ایده، خرید محصول یا برد حراج به پروژه می‌دهند. حساب درجه‌دو است؛ تعداد حامی از مقدار سکه مهم‌تر است:</p>
          <p className="rounded-xl bg-brand-ice px-3 py-2 font-bold text-brand-navy">«{PEOPLE_SLOGAN}»</p>
          <p>
            از هر نفر حداکثر {coins(values.supportCap)} برای هر پروژه حساب می‌شود و سکهٔ اعضای خود تیم حساب نمی‌شود.
          </p>
        </Box>
        <Box emoji={SCORE_CATEGORY_LABELS.ai.emoji} title={<ScoreTitle label={SCORE_CATEGORY_LABELS.ai.label} weight={SCORE_WEIGHTS.ai} />}>
          <p>هوش مصنوعی محصول و صفحهٔ آن را از ۰ تا ۱۰۰ ارزیابی می‌کند. این نمره همیشه جدا از نمرهٔ داوران انسانی نشان داده می‌شود.</p>
        </Box>
      </div>
      <div className="rounded-2xl bg-brand-ice border border-brand-mist p-4 space-y-2">
        <div className="text-xs font-bold text-brand-cyan-dark">برچسب 🤖 روی کارت‌ها</div>
        <p className="text-sm">
          روی کارت هر ایده و محصول یک برچسب هوش مصنوعی با خلاصهٔ دلیلش می‌بینی. این برچسب فقط راهنماست؛ داوری انسانی جداست.
        </p>
        <div className="flex flex-wrap gap-2">
          <span className="chip-ok"><span aria-hidden>🤖</span> {AI_TAG_LABEL.great}</span>
          <span className="chip-cyan"><span aria-hidden>🤖</span> {AI_TAG_LABEL.good}</span>
          <span className="chip-gold"><span aria-hidden>🤖</span> {AI_TAG_LABEL.work}</span>
        </div>
      </div>
      <p className="text-xs text-brand-slate">
        تا پایان بازی امتیازها پنهان‌اند و جدول فقط «تعداد حامی» هر تیم را نشان می‌دهد. «کسر تقلب» (اگر باشد) از جمع سه معیار کم
        می‌شود؛ بخش «قوانین» را ببین.
      </p>
    </Section>
  );
}

function ScoreTitle({ label, weight }: { label: string; weight: number }) {
  return (
    <>
      {label} <span className="chip-navy !text-[11px] fa-num">{fa(weight)} امتیاز</span>
    </>
  );
}

function StudioSection() {
  return (
    <Section id="studio" emoji="🚀" title="بازار استودیو (اختیاری)" desc="محصولت را واقعاً منتشر کن.">
      <List
        items={[
          <>در «{PHASE_LABEL.BUILD}» یا «{PHASE_LABEL.MARKET}» از صفحهٔ ساخت محصول درخواست انتشار بده (لینک کد یا بستهٔ محصول + توضیح کوتاه).</>,
          "برگزارکننده انتشار را پیگیری می‌کند؛ محصول منتشرشده نشان «🚀 لایو» می‌گیرد.",
          "فقط محصولات لایو نامزد جایزهٔ «بهترین محصول لایو» هستند. انتشار اثر مستقیمی در امتیاز ندارد.",
        ]}
      />
      <Link href="/build" className="btn-ghost inline-flex">🛠️ ساخت محصول ←</Link>
    </Section>
  );
}

function AwardsSection({ pool }: { pool: PrizePool }) {
  return (
    <Section id="awards" emoji="🏆" title="جوایز" desc="پنج جایزهٔ نقدی، هر کدام درصدی از صندوق جایزه.">
      <div className="rounded-2xl bg-brand-ice border border-brand-mist p-4 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="text-xs font-bold text-brand-cyan-dark">صندوق جایزهٔ فعلی</div>
          <div className="text-2xl font-black text-brand-navy fa-num">{million(pool.totalMillion)} میلیون تومان</div>
        </div>
        <div className="text-xs text-brand-slate fa-num">
          پایهٔ {million(PRIZE_POOL_BASE_MILLION_TOMAN)} + خرید سکه {million(pool.extraMillion)} (میلیون تومان)
        </div>
      </div>
      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-sm min-w-[520px]">
          <caption className="sr-only">پنج جایزهٔ نقدی، معیار و مبلغ فعلی هرکدام</caption>
          <thead>
            <tr className="text-right text-brand-slate border-b border-brand-mist">
              <th scope="col" className="px-3 py-2 font-bold">جایزه</th>
              <th scope="col" className="px-3 py-2 font-bold">برنده</th>
              <th scope="col" className="px-3 py-2 font-bold">سهم</th>
              <th scope="col" className="px-3 py-2 font-bold">مبلغ فعلی (میلیون تومان)</th>
            </tr>
          </thead>
          <tbody>
            {PRIZES.map((p) => (
              <tr key={p.key} className="border-b border-brand-mist/60 last:border-0 align-top">
                <td className="px-3 py-2 font-bold text-brand-navy whitespace-nowrap">
                  <span aria-hidden>{p.emoji}</span> {p.label}
                </td>
                <td className="px-3 py-2 text-brand-slate">{p.criterion}</td>
                <td className="px-3 py-2 fa-num whitespace-nowrap">{fa(p.sharePct)}٪</td>
                <td className="px-3 py-2 fa-num font-black text-brand-cyan-dark whitespace-nowrap">{million(prizeAmountMillion(pool, p.sharePct))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="font-bold">هر پروژه حداکثر یک جایزه می‌برد.</p>
      <p className="text-xs text-brand-slate">با هر خرید سکه، صندوق و مبلغ همهٔ جوایز بزرگ‌تر می‌شود.</p>
    </Section>
  );
}

function RulesSection() {
  return (
    <Section id="rules" emoji="⚖️" title="قوانین">
      <List items={[...CORE_RULES]} />
      <div className="rounded-2xl bg-red-50 border border-red-100 p-4">
        <div className="text-xs font-bold text-brand-red mb-1.5">🔍 تقلب</div>
        <p className="text-sm text-brand-navy">{ANTI_CHEAT_STATEMENT}</p>
      </div>
    </Section>
  );
}

function LoginSection() {
  return (
    <Section id="login" emoji="🔑" title="ورود و دسترسی" desc="فقط همکارانی که در لیست سفید رویداد هستند می‌توانند حساب بسازند.">
      <List
        items={[
          "با ایمیل سازمانی و رمزت وارد شو، یا اگر موبایلت را تأیید کرده‌ای با کد پیامکی (هر کد دو دقیقه اعتبار دارد).",
          "اگر در فهرست نیستی، از صفحهٔ ورود «درخواست دسترسی» بده تا برگزارکننده تأیید کند.",
          "ابزارهای هوش مصنوعی متیس و آتنا پس از پایان ثبت‌نام و تیم‌بندی در اختیار همه قرار می‌گیرند.",
        ]}
      />
    </Section>
  );
}

// پاسخ تابعی با مقادیر مؤثر بازی (تنظیم برگزارکننده) ساخته می‌شود
const FAQ: { q: string; a: React.ReactNode | ((v: GameValues) => React.ReactNode) }[] = [
  {
    q: "تعداد اعضای تیم در امتیاز اثر دارد؟",
    a: "نه. تعداد اعضای تیم در امتیاز هیچ اثری ندارد؛ شرکت فردی، تیم دونفره و تیم سه‌نفره با همان سه معیار و همان وزن‌ها امتیاز می‌گیرند.",
  },
  {
    q: "سکه‌هایم تمام شد؛ چه کنم؟",
    a: (v) => (
      <>
        از صفحهٔ «کیف سکه» سکهٔ بیشتر بخر؛ هر سکه {fa(COIN_PRICE_TOMAN)} تومان و حداکثر {fa(v.maxBoughtCoinsPerUser)} سکه برای هر نفر.
        همهٔ این پول به صندوق جایزه اضافه می‌شود.
      </>
    ),
  },
  {
    q: "با خرید سکهٔ زیاد می‌شود امتیاز خرید؟",
    a: (v) => (
      <>
        نه. از هر نفر برای هر پروژه حداکثر {coins(v.supportCap)} در حمایت مردمی حساب می‌شود و حساب درجه‌دو است؛ پس ده حامی کوچک خیلی
        بیشتر از یک حامی بزرگ می‌ارزند.
      </>
    ),
  },
  {
    q: "می‌توانم از تیم خودم حمایت کنم یا از آن بخرم؟",
    a: "نه. حمایت از ایده و خرید از محصول تیم خودت ممنوع است؛ سکهٔ اعضای خود تیم هم در حمایت مردمی حساب نمی‌شود.",
  },
  {
    q: "چرا رتبه تا پایان بازی پنهان است؟",
    a: "تا رقابت تا لحظهٔ آخر باز بماند. تا آن موقع جدول فقط تعداد حامی هر تیم را نشان می‌دهد و امتیاز کل، ریزامتیازها و جوایز در «پایان بازی» اعلام می‌شوند.",
  },
];

function FaqSection({ values }: { values: GameValues }) {
  return (
    <Section id="faq" emoji="❓" title="سؤالات متداول">
      <div className="space-y-2.5">
        {FAQ.map((f) => (
          <details key={f.q} className="rounded-2xl border border-brand-mist p-4 group">
            <summary className="cursor-pointer font-bold text-brand-navy list-none flex items-center justify-between gap-3">
              <span>{f.q}</span>
              <span className="text-brand-cyan-dark group-open:rotate-45 transition-transform shrink-0" aria-hidden>＋</span>
            </summary>
            <p className="mt-2 text-sm text-brand-slate leading-7">{typeof f.a === "function" ? f.a(values) : f.a}</p>
          </details>
        ))}
      </div>
    </Section>
  );
}

function BottomCta({ loggedIn }: { loggedIn: boolean }) {
  return (
    <div className="card p-8 text-center bg-brand-navy text-white anim-rise">
      <h3 className="text-xl md:text-2xl font-black">{loggedIn ? "آماده‌ای ادامه بدهی؟" : "آماده‌ای وارد میدان شوی؟"}</h3>
      <p className="mt-1.5 text-sm text-white/80">
        {loggedIn ? "برگرد به اتاق تیمت و قدم بعدی را بردار." : "همین الان ثبت‌نام کن؛ تنها یا با تیمت."}
      </p>
      <Link href={loggedIn ? "/team" : "/register"} className="btn-primary mt-5 inline-flex">
        {loggedIn ? "برو اتاق تیم ←" : "ثبت‌نام ←"}
      </Link>
    </div>
  );
}
