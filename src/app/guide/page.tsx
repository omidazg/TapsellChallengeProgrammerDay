import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getPhase, getSettingInt } from "@/lib/phase";
import { DEFAULTS, AD_SLOT_KINDS, COIN_PRICE_TOMAN } from "@/lib/constants";
import { SCORE_CATEGORY_LABELS, SCORE_CATEGORY_JUDGE, SCORE_CATEGORY_MEASURES, SCORE_CATEGORY_ORDER, SCORE_CATEGORY_TIPS } from "@/lib/score-labels";
import { AI_TAG_LABEL } from "@/lib/ai-tag";
import { listPrizes } from "@/lib/scoring";
import { formatPrizeAmount, type PrizeRow } from "@/lib/prizes";
import { CORE_RULES, OWNERSHIP_RULES, ANTI_CHEAT_STATEMENT } from "@/lib/rules";
import { getEffectiveGameValues, type GameValues } from "@/lib/game-values";
import { effectiveMaxPrice } from "@/lib/product";
import { peopleExample } from "@/lib/people-example";
import { MODULE_STATUS_LABEL, type ModuleStatus } from "@/lib/modules";
import {
  DEFAULT_JURY_CRITERIA,
  DEFAULT_WEIGHTS,
  ENTRY_CATEGORY_LABEL,
  MARKET_SUB_LABEL,
  NO_BAZAAR_WEIGHTS,
  TRACK_KIND_LABEL,
  listVisibleTracks,
  type EntryCategory,
  type MarketSubWeights,
  type TrackInfo,
  type TrackWeights,
} from "@/lib/track-data";
import { fa, coins, jdatetime } from "@/lib/persian";
import { Container } from "@/components/ui";

export const metadata = { title: "راهنمای بازی" };

const TOC: { id: string; label: string; emoji: string }[] = [
  { id: "overview", label: "خلاصهٔ بازی", emoji: "🗺️" },
  { id: "flow", label: "مسیر هر تیم", emoji: "🧭" },
  { id: "tracks", label: "محورها", emoji: "🎯" },
  { id: "modules", label: "وضعیت بخش‌ها", emoji: "🚦" },
  { id: "teams", label: "تیم", emoji: "👥" },
  { id: "coins", label: "سکه", emoji: "🪙" },
  { id: "spend", label: "خرج سکه", emoji: "🛍️" },
  { id: "scoring", label: "امتیازدهی", emoji: "📊" },
  { id: "ai", label: "هوش مصنوعی", emoji: "🤖" },
  { id: "jury", label: "داوری", emoji: "🧑‍⚖️" },
  { id: "studio", label: "بازار استودیو", emoji: "🚀" },
  { id: "awards", label: "جوایز", emoji: "🏆" },
  { id: "rules", label: "قوانین", emoji: "⚖️" },
  { id: "ownership", label: "مالکیت محصول", emoji: "📜" },
  { id: "login", label: "ورود", emoji: "🔑" },
  { id: "faq", label: "سؤال‌های پرتکرار", emoji: "❓" },
];

/** تنظیم‌های حراج، جایگاه و جایزه که در GameValues نیستند — همان کلیدها و پیش‌فرض‌هایی که موتور بازی می‌خواند */
type LiveRules = {
  antiSnipeWindowSec: number;
  antiSnipeExtendSec: number;
  auctionEnqueueCutoffMin: number;
  maxPrice: number;
  adslotHours: number;
  ratingMinComments: number;
  prizeMinEntries: number;
  prizeMinJury: number;
};

export default async function GuidePage() {
  // مقادیر مؤثر (تنظیم برگزارکننده یا پیش‌فرض) — همان اعدادی که بازی اعمال می‌کند
  const [user, { endsAt }, values, tracks, allPrizes, antiSnipeWindowSec, antiSnipeExtendSec, auctionEnqueueCutoffMin, maxPrice, adslotHours, ratingMinComments, prizeMinEntries, prizeMinJury] =
    await Promise.all([
      getCurrentUser(),
      getPhase(),
      getEffectiveGameValues(),
      listVisibleTracks(),
      listPrizes(),
      getSettingInt("anti_snipe_window_sec", DEFAULTS.antiSnipeWindowSec),
      getSettingInt("anti_snipe_extend_sec", DEFAULTS.antiSnipeExtendSec),
      getSettingInt("auction_enqueue_cutoff_min", DEFAULTS.auctionEnqueueCutoffMin),
      effectiveMaxPrice(),
      getSettingInt("adslot_hours", DEFAULTS.adslotHours),
      getSettingInt("rating_min_comments", DEFAULTS.ratingMinComments),
      getSettingInt("prize_min_entries", DEFAULTS.prizeMinEntries),
      getSettingInt("prize_min_jury", DEFAULTS.prizeMinJury),
    ]);
  const live: LiveRules = { antiSnipeWindowSec, antiSnipeExtendSec, auctionEnqueueCutoffMin, maxPrice, adslotHours, ratingMinComments, prizeMinEntries, prizeMinJury };
  const trackIds = new Set(tracks.map((t) => t.id));
  const prizes = allPrizes.filter((p) => trackIds.has(p.trackId));

  return (
    <>
      <Hero />
      <Container className="space-y-6">
        <MobileToc />
        <div className="grid lg:grid-cols-[260px_1fr] gap-8 items-start">
          <DesktopToc />
          <div className="space-y-6 min-w-0">
            <OverviewSection values={values} endsAt={endsAt} />
            <FlowSection />
            <TracksSection tracks={tracks} />
            <ModulesSection />
            <TeamsSection />
            <CoinsSection values={values} />
            <SpendSection values={values} live={live} />
            <ScoringSection values={values} tracks={tracks} live={live} />
            <AiSection />
            <JurySection />
            <StudioSection />
            <AwardsSection prizes={prizes} tracks={tracks} live={live} />
            <RulesSection />
            <OwnershipSection />
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
            میدان بنیان‌گذاران یک مسابقهٔ استارتاپی برای همهٔ پیلارهای گروه پگاه است: تنها یا با یک تا دو هم‌تیمی ایده می‌دهی، محصول
            می‌سازی و عرضه‌اش می‌کنی. همه‌چیز از اول باز است و هر تیم با سرعت خودش جلو می‌رود.
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

function OverviewSection({ values, endsAt }: { values: GameValues; endsAt: Date | null }) {
  return (
    <Section id="overview" emoji="🗺️" title="خلاصهٔ بازی">
      <List
        items={[
          "تنها («شرکت فردی») یا در تیم ۲ یا ۳ نفره یک استارتاپ کوچک می‌سازی.",
          "یک یا چند محور را انتخاب می‌کنی و در هر محور ایده و محصول جدا داری.",
          "یک کیف سکه داری؛ با آن از ایده‌ها حمایت می‌کنی، محصول می‌خری، در حراج شرکت می‌کنی و برای جایگاه تبلیغاتی پیشنهاد می‌دهی.",
          <>
            امتیاز هر محصول از سه بخش می‌آید: <b>هوش مصنوعی</b>، <b>بازار</b> و <b>داوری</b>.
          </>,
          "هر جایزه مبلغ ثابت دارد و از همان ابتدا روی سایت دیده می‌شود.",
          <>
            مسابقه {fa(values.contestDays)} روز طول می‌کشد و تنها زمان‌بندی آن ددلاین نهایی است
            {endsAt && !Number.isNaN(endsAt.getTime()) && <> ({jdatetime(endsAt)})</>}.
          </>,
        ]}
      />
    </Section>
  );
}

const FLOW_STEPS: { emoji: string; title: string; desc: string; href: string }[] = [
  { emoji: "👥", title: "تیم", desc: "تیم بساز، به تیمی بپیوند یا فردی شرکت کن.", href: "/team" },
  { emoji: "💡", title: "ایده", desc: "در محور دلخواهت ایده بده و ثبت نهایی کن. از همین‌جا حمایت با سکه شروع می‌شود.", href: "/idea" },
  { emoji: "🛠️", title: "محصول", desc: "بعد از ثبت ایده، محصول همان محور را بساز و ثبت نهایی کن تا در بازار دیده شود.", href: "/build" },
  { emoji: "🚀", title: "درخواست انتشار", desc: "در محور ساخت محصول، درخواست انتشار روی بازار استودیو بده تا نصب و درآمد واقعی امتیاز بیاورد.", href: "/build" },
];

function FlowSection() {
  return (
    <Section id="flow" emoji="🧭" title="مسیر هر تیم" desc="زمان‌بندی مرحله‌ای وجود ندارد. هر تیم با سرعت خودش جلو می‌رود، فقط ترتیب داخلی خودش را طی می‌کند.">
      <ol className="relative border-r-2 border-brand-mist pr-6 space-y-4">
        {FLOW_STEPS.map((s) => (
          <li key={s.title} className="relative">
            <span className="absolute right-[-31px] top-1.5 size-4 rounded-full border-2 bg-white border-brand-mist" aria-hidden />
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-lg" aria-hidden>{s.emoji}</span>
              <Link href={s.href} className="font-black text-brand-navy hover:text-brand-cyan-dark">{s.title}:</Link>
              <span className="text-sm text-brand-slate">{s.desc}</span>
            </div>
          </li>
        ))}
      </ol>
      <p className="text-xs text-brand-slate">
        زودتر رسیدن پاداش خودش را دارد: حمایت با سکه و خرید از همان اول باز است، پس تیمی که زودتر ایده و محصولش را ثبت کند زودتر حامی و خریدار جمع می‌کند.
      </p>
      <p className="text-xs text-brand-slate">با رسیدن ددلاین نهایی، مسابقه خودکار بسته می‌شود و بخش‌های بازی فقط‌خواندنی می‌شوند.</p>
    </Section>
  );
}

function TracksSection({ tracks }: { tracks: TrackInfo[] }) {
  return (
    <Section id="tracks" emoji="🎯" title="محورها" desc="هر تیم می‌تواند در چند محور شرکت کند، با ایده و محصول جدا در هر محور.">
      <div className="grid sm:grid-cols-2 gap-3">
        {tracks.map((t) => (
          <Box key={t.id} emoji="🎯" title={t.name}>
            <p>{t.description || TRACK_KIND_LABEL[t.kind]}</p>
            {t.category === "MIXED" ? (
              <p>دو دسته دارد: {ENTRY_CATEGORY_LABEL.TECH} و {ENTRY_CATEGORY_LABEL.NON_TECH}. دسته را هنگام ساخت محصول خودت انتخاب می‌کنی (مثلاً محصول با ابزار بدون کد غیرفنی است).</p>
            ) : (
              <p>دسته: {ENTRY_CATEGORY_LABEL[t.category as EntryCategory]}</p>
            )}
            {t.kind === "CONTENT" && <p>خروجی می‌تواند هر چیزی باشد: فیلم، موسیقی، پادکست، دوره، برنامهٔ دنباله‌دار یا راهکار تولید محتوا.</p>}
            {t.kind === "OS" && <p>تحویل این محور لینک PR یا MR است.</p>}
          </Box>
        ))}
      </div>
      <List
        items={[
          "هر محور جدول امتیاز جدا دارد و یک نمای کلی هم همهٔ محورها را کنار هم نشان می‌دهد.",
          "هر محصول فقط با محصول‌های همان محور مقایسه می‌شود و هر محور وزن و معیار خودش را دارد.",
          "جدول محور عمومی به تفکیک فنی و غیرفنی هم دیده می‌شود.",
        ]}
      />
    </Section>
  );
}

const STATUS_DESC: Record<ModuleStatus, string> = {
  open: "بخش کار می‌کند و می‌توانی در آن فعالیت کنی.",
  ro: "صفحه را می‌بینی ولی فرم‌ها غیرفعال‌اند.",
  closed: "صفحه فقط پیام «بسته است» را نشان می‌دهد.",
  hidden: "بخش از منو برداشته شده و صفحه‌اش در دسترس نیست.",
};

function ModulesSection() {
  return (
    <Section id="modules" emoji="🚦" title="وضعیت بخش‌ها" desc="هر بخش سایت (تیم، ایده، ساخت، بازار، نتایج و…) وضعیت خودش را دارد که برگزارکننده دستی تعیین می‌کند.">
      <div className="grid sm:grid-cols-2 gap-3">
        {(Object.keys(MODULE_STATUS_LABEL) as ModuleStatus[]).map((s) => (
          <Box key={s} emoji={s === "open" ? "🟢" : s === "ro" ? "🟡" : s === "closed" ? "🔴" : "⚫"} title={MODULE_STATUS_LABEL[s]}>
            <p>{STATUS_DESC[s]}</p>
          </Box>
        ))}
      </div>
      <p className="text-xs text-brand-slate">
        برگزارکننده می‌تواند یک بخش را فقط برای یک تیم باز کند. اگر بخشی برای کارت باز نبود، در صفحهٔ همان بخش توضیحش را می‌بینی.
      </p>
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
          "یا تیم بساز و یک یا دو هم‌تیمی دعوت کن، یا با دعوت تیمی که جای خالی دارد به آن بپیوند.",
          <>
            <b>پیوستن فقط با دعوت:</b> لینک دعوت خصوصی هر تیم فقط به اعضای همان تیم نشان داده می‌شود؛ آن را برای هم‌تیمی‌ات بفرست یا
            از اتاق تیم با ایمیلش دعوتش کن. آدرس عمومی صفحهٔ تیم برای پیوستن کافی نیست.
          </>,
          <>
            <b>تغییر اعضا:</b> تا وقتی تیم محصولی را ثبت نهایی نکرده و بخش تیم باز است، اعضا قابل تغییرند.
          </>,
          "هر عضو می‌تواند ایده، محصول، حراج و درخواست انتشار تیم را ثبت کند و از سکهٔ خودش برای جایگاه تبلیغاتی پیشنهاد بدهد.",
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
      <div className="grid sm:grid-cols-2 gap-3">
        <Box emoji="🎁" title="سکهٔ رایگان اولیه">
          <div className="text-2xl font-black text-brand-cyan-dark fa-num">{coins(values.startingCoins)}</div>
          <p>برای هر نفر، از همان ابتدا.</p>
        </Box>
        <Box emoji="💳" title="خرید سکهٔ بیشتر">
          <div className="text-2xl font-black text-brand-red fa-num">{fa(COIN_PRICE_TOMAN)} تومان</div>
          <p>
            قیمت هر سکه؛ حداقل {fa(DEFAULTS.minCoinPurchase)} و حداکثر {fa(values.maxBoughtCoinsPerUser)} سکه برای هر نفر در کل مسابقه.
          </p>
        </Box>
      </div>
      <Link href="/coins" className="btn-ghost inline-flex">🪙 خرید سکه ←</Link>
    </Section>
  );
}

function SpendSection({ values, live }: { values: GameValues; live: LiveRules }) {
  return (
    <Section id="spend" emoji="🛍️" title="سکه را کجا خرج کنی؟" desc="همه از همان یک کیف سکه؛ حمایت از ایده یا خرید از محصول تیم خودت ممنوع است.">
      <div className="grid sm:grid-cols-2 gap-3">
        <Box id="invest" emoji="🤝" title="حمایت از ایده‌ها">
          <p>از ایده‌های تیم‌های دیگر با هر مقدار سکه که دوست داری حمایت کن؛ حتی اگر تیم نداشته باشی. تحلیل هوش مصنوعی روی هر ایده به تصمیمت کمک می‌کند.</p>
          <p>
            <b>پس‌گرفتن حمایت:</b> تیم می‌تواند ایده را بعد از گرفتن حمایت ویرایش کند، ولی تاریخچهٔ تغییرات برای حامی‌ها نمایش داده می‌شود. حمایتی را که پیش از آخرین
            ویرایش داده‌ای می‌توانی پس بگیری؛ سکه‌اش کامل برمی‌گردد و از امتیاز تیم کم می‌شود. حمایت بعد از آخرین ویرایش برگشت ندارد.
          </p>
          <Link href="/invest" className="inline-flex items-center min-h-11 font-bold text-brand-cyan-dark hover:underline">ایده‌ها ←</Link>
        </Box>
        <Box id="market" emoji="🛒" title="خرید محصول در بازار">
          <p>
            محصول تیم‌های دیگر را با قیمت کامل بخر. قیمت هر محصول را تیمش بین {fa(DEFAULTS.minPrice)} تا {fa(live.maxPrice)} سکه
            تعیین می‌کند.
          </p>
          <Link href="/market" className="inline-flex items-center min-h-11 font-bold text-brand-cyan-dark hover:underline">بازار ←</Link>
        </Box>
        <Box id="auction" emoji="🔨" title="حراج زنده (بخشی از بازار)">
          <p>
            هر تیم نسخهٔ ویژهٔ محصولش را از صفحهٔ محصول به صف حراج می‌فرستد (تا {fa(live.auctionEnqueueCutoffMin)} دقیقه پیش از ددلاین
            نهایی). حراج‌ها یکی‌یکی و به ترتیب صف زنده می‌شوند.
          </p>
          <p>
            هر پیشنهاد دست‌کم {fa(values.bidIncrement)} سکه بیشتر از بالاترین پیشنهاد است و پیشنهاد در {fa(live.antiSnipeWindowSec)}{" "}
            ثانیهٔ آخر، حراج را {fa(live.antiSnipeExtendSec)} ثانیه تمدید می‌کند. برنده همان مبلغ پیشنهادش را می‌پردازد و برد حراج
            یک خرید حساب می‌شود.
          </p>
          <Link href="/auction" className="inline-flex items-center min-h-11 font-bold text-brand-cyan-dark hover:underline">حراج ←</Link>
        </Box>
        <Box id="adslots" emoji="📣" title="مزایدهٔ جایگاه تبلیغاتی">
          <p>
            جایگاه‌ها بازه‌های {fa(live.adslotHours)} ساعته دارند و مزایده‌ای‌اند. تا شروع هر بازه، هر کس پیشنهاد بالاتری بدهد جایگاه را می‌گیرد، حتی اگر دیرتر
            آمده باشد، و سکهٔ نفر قبلی کامل برمی‌گردد.
          </p>
          <p>
            کمترین پیشنهاد: {AD_SLOT_KINDS.BANNER.label} {coins(values.adslotPriceBanner)}، {AD_SLOT_KINDS.FEATURED.label} {coins(values.adslotPriceFeatured)}،{" "}
            {AD_SLOT_KINDS.PUSH.label} {coins(values.adslotPricePush)}. هر پیشنهاد تازه دست‌کم {fa(values.adslotBidIncrement)} سکه بالاتر از قبلی است.
          </p>
          <p>
            هر تیم هم‌زمان حداکثر {fa(values.adslotMaxPerTeam)} جایگاه در دست دارد، فقط پس از ثبت نهایی محصول. جایگاه فقط دیده‌شدن را بیشتر می‌کند و در امتیاز اثری ندارد.
          </p>
          <p>اگر بازه‌ای که برده‌ای اجرا نشود، سکه‌اش هنگام بسته شدن مسابقه به کیفت برمی‌گردد.</p>
          <Link href="/adslots" className="inline-flex items-center min-h-11 font-bold text-brand-cyan-dark hover:underline">جایگاه‌ها ←</Link>
        </Box>
      </div>
    </Section>
  );
}

const MARKET_SUB_ORDER: readonly (keyof MarketSubWeights)[] = ["support", "activeInstalls", "revenue", "rating", "comments"];

function weightSummary(w: TrackWeights): string {
  return SCORE_CATEGORY_ORDER.map((k) => `${SCORE_CATEGORY_LABELS[k].label} ${fa(w[k] * 10)}`).join("، ");
}

function ScoringSection({ values, tracks, live }: { values: GameValues; tracks: TrackInfo[]; live: LiveRules }) {
  const columns: { label: string; w: TrackWeights }[] = [
    { label: "وزن پیش‌فرض", w: DEFAULT_WEIGHTS },
    { label: "محور بدون بازار", w: NO_BAZAAR_WEIGHTS },
  ];
  return (
    <Section
      id="scoring"
      emoji="📊"
      title="امتیازدهی"
      desc={`هر محصول از سه بخش امتیاز می‌گیرد (جمعاً ${fa(1000)}) و هر بخش نسبت به بهترین محصول همان محور سنجیده می‌شود.`}
    >
      <div className="grid md:grid-cols-3 gap-3">
        {SCORE_CATEGORY_ORDER.map((k) => (
          <Box key={k} emoji={SCORE_CATEGORY_LABELS[k].emoji} title={SCORE_CATEGORY_LABELS[k].label}>
            <p>{SCORE_CATEGORY_MEASURES[k]}</p>
            <p>
              <b className="text-brand-navy">چه کسی:</b> {SCORE_CATEGORY_JUDGE[k]}
            </p>
            <p>
              <b className="text-brand-navy">چطور بالا ببری:</b> {SCORE_CATEGORY_TIPS[k]}
            </p>
          </Box>
        ))}
      </div>

      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-sm min-w-[420px]">
          <caption className="sr-only">وزن امتیازها در محور پیش‌فرض و محور بدون انتشار روی بازار</caption>
          <thead>
            <tr className="text-right text-brand-slate border-b border-brand-mist">
              <th scope="col" className="px-3 py-2 font-bold">بخش</th>
              {columns.map((c) => (
                <th key={c.label} scope="col" className="px-3 py-2 font-bold">{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SCORE_CATEGORY_ORDER.map((k) => (
              <>
                <tr key={k} className="border-b border-brand-mist/60">
                  <th scope="row" className="px-3 py-2 text-right font-bold text-brand-navy whitespace-nowrap">
                    <span aria-hidden>{SCORE_CATEGORY_LABELS[k].emoji}</span> {SCORE_CATEGORY_LABELS[k].label}
                  </th>
                  {columns.map((c) => (
                    <td key={c.label} className="px-3 py-2 fa-num font-black">{fa(c.w[k] * 10)}</td>
                  ))}
                </tr>
                {k === "market" &&
                  MARKET_SUB_ORDER.map((s) => (
                    <tr key={s} className="border-b border-brand-mist/60">
                      <th scope="row" className="px-3 py-1.5 pr-8 text-right font-normal text-brand-slate whitespace-nowrap">{MARKET_SUB_LABEL[s]}</th>
                      {columns.map((c) => (
                        <td key={c.label} className="px-3 py-1.5 fa-num text-brand-slate">
                          {c.w.marketSub[s] > 0 ? fa((c.w.market * 10 * c.w.marketSub[s]) / 100) : "—"}
                        </td>
                      ))}
                    </tr>
                  ))}
              </>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <div className="font-bold text-brand-navy mb-1">وزن فعلی هر محور</div>
        <List items={tracks.map((t) => <>{t.name}: <span className="fa-num">{weightSummary(t.weights)}</span></>)} />
        <p className="mt-1 text-xs text-brand-slate">برگزارکننده می‌تواند وزن هر محور را تغییر دهد؛ عددهای بالا همیشه وزن فعلی‌اند.</p>
      </div>

      <div className="rounded-2xl bg-brand-ice border border-brand-mist p-4 space-y-2">
        <div className="font-bold text-brand-navy">شاخص‌های بازار استودیو</div>
        <List
          items={[
            "نصب فعال: کاربرانی که برنامه را حذف نکرده‌اند.",
            "درآمد واقعی: پرداخت درون‌برنامه‌ای یا خرید.",
            `امتیاز ستاره‌ای: فقط با دست‌کم ${fa(live.ratingMinComments)} نظر حساب می‌شود.`,
            "تعداد نظر: کامنت‌های کاربران.",
          ]}
        />
        <p className="text-xs text-brand-slate">
          نصب، درآمد و نظر با مقیاس لگاریتمی نسبت به بهترین محصول همان محور سنجیده می‌شوند تا یک محصول پرطرفدار بقیه را به صفر نرساند. آمار از لحظهٔ انتشار تا ددلاین نهایی
          جمع می‌شود و در پایان یک برداشت نهایی از آن ثبت می‌شود. آمار مشکوک به نصب یا نظر جعلی پرچم می‌خورد و تا رفع پرچم حساب نمی‌شود.
        </p>
      </div>

      <div className="rounded-2xl bg-brand-ice border border-brand-mist p-4 space-y-2">
        <div className="font-bold text-brand-navy">حمایت با سکه</div>
        <p className="text-sm">هر سکه‌ای که دیگران با حمایت از ایده، خرید محصول یا برد حراج به پروژه می‌دهند. حساب درجه‌دو است؛ تعداد حامی از مقدار سکه مهم‌تر است:</p>
        <p className="rounded-xl bg-white/70 px-3 py-2 font-bold text-brand-navy">«{peopleExample(values.supportCap)}»</p>
        <p className="text-sm">از هر نفر حداکثر {coins(values.supportCap)} برای هر پروژه حساب می‌شود و سکهٔ اعضای خود تیم حساب نمی‌شود.</p>
      </div>

      <p className="text-xs text-brand-slate">
        <b>چه چیزی زنده است؟</b> امتیاز هوش مصنوعی و بازار در جدول به‌صورت زنده دیده می‌شود. نمرهٔ داوری فقط با اعلام نتایج اضافه می‌شود، پس جمع زنده بدون داوری است و رتبه‌ها تا
        آن موقع می‌توانند عوض شوند. «کسر تقلب» (اگر باشد) از جمع کم می‌شود.
      </p>
      <p className="text-xs text-brand-slate">
        <b>امتیاز مساوی:</b> رتبهٔ بالاتر با امتیاز کل بیشتر است؛ اگر برابر بود با حمایت با سکهٔ بیشتر، بعد نمرهٔ داوری بیشتر و بعد ثبت نهایی زودتر محصول.
      </p>
    </Section>
  );
}

function AiSection() {
  return (
    <Section id="ai" emoji="🤖" title="هوش مصنوعی" desc="هوش مصنوعی از مرحلهٔ ایده کنار تیم است، ولی فقط ارزیابی پایانی و بازخورد محصول در امتیاز می‌آیند.">
      <div className="grid md:grid-cols-3 gap-3">
        <Box emoji="💡" title="نظر روی ایده">
          <p>بعد از ثبت ایده، هوش مصنوعی به تیم پیشنهاد می‌دهد تا روی ایده بیشتر فکر کند و خلاصهٔ تحلیلش به حامی‌ها هم در تصمیم‌گیری کمک می‌کند. این نظر امتیاز نیست.</p>
        </Box>
        <Box emoji="🛠️" title="بازخورد محصول و یک بار ارزیابی مجدد">
          <p>بلافاصله بعد از ثبت نهایی محصول، نمره و بازخورد موقت می‌گیری. می‌توانی محصول را بهتر کنی و فقط یک بار درخواست ارزیابی مجدد بدهی.</p>
        </Box>
        <Box emoji="🏁" title="ارزیابی نهایی">
          <p>در پایان، همهٔ محصول‌ها یک‌جا و دقیق‌تر ارزیابی می‌شوند، با پارامترهایی که هوش مصنوعی برای هر محور تعیین می‌کند. این نمره جای بازخورد موقت را می‌گیرد.</p>
        </Box>
      </div>
      <div className="rounded-2xl bg-brand-ice border border-brand-mist p-4 space-y-2">
        <div className="text-xs font-bold text-brand-cyan-dark">برچسب 🤖 روی کارت‌ها</div>
        <p className="text-sm">
          روی کارت هر ایده و محصول یک برچسب هوش مصنوعی با خلاصهٔ دلیلش می‌بینی. این برچسب فقط راهنماست؛ داوری جداست.
        </p>
        <div className="flex flex-wrap gap-2">
          <span className="chip-ok"><span aria-hidden>🤖</span> {AI_TAG_LABEL.great}</span>
          <span className="chip-cyan"><span aria-hidden>🤖</span> {AI_TAG_LABEL.good}</span>
          <span className="chip-gold"><span aria-hidden>🤖</span> {AI_TAG_LABEL.work}</span>
        </div>
      </div>
    </Section>
  );
}

function JurySection() {
  return (
    <Section id="jury" emoji="🧑‍⚖️" title="داوری" desc="داوری بر همهٔ تیم‌ها انجام می‌شود، نه فقط فینالیست‌ها.">
      <List
        items={[
          "هر داور حساب جدا دارد و مستقل از بقیه نمره می‌دهد؛ نتیجه میانگین نمرهٔ داورهاست.",
          "هر محور معیارهای داوری خودش را دارد و هر معیار از ۰ تا ۱۰ نمره می‌گیرد.",
          "نمرهٔ داوری تا اعلام نتایج به هیچ شرکت‌کننده‌ای نشان داده نمی‌شود.",
        ]}
      />
      <div>
        <div className="font-bold text-brand-navy mb-1">معیارهای پیش‌فرض</div>
        <ol className="list-decimal pr-5 space-y-0.5">
          {DEFAULT_JURY_CRITERIA.map((c) => (
            <li key={c.key}>{c.label}</li>
          ))}
        </ol>
      </div>
    </Section>
  );
}

function StudioSection() {
  return (
    <Section id="studio" emoji="🚀" title="بازار استودیو" desc="در محورهایی که روی بازار منتشر می‌شوند، بیشتر بخش بازار از آمار واقعی می‌آید.">
      <List
        items={[
          "بعد از ثبت نهایی محصول، از صفحهٔ ساخت محصول درخواست انتشار بده (لینک کد یا بستهٔ محصول، شناسهٔ بسته و توضیح کوتاه).",
          "تیم بازار استودیو درخواست را بررسی و منتشر می‌کند؛ محصول منتشرشده نشان «🚀 لایو» می‌گیرد.",
          "از لحظهٔ انتشار، نصب فعال، درآمد، امتیاز ستاره‌ای و تعداد نظر محصول در امتیاز بازار حساب می‌شود.",
          "محورهایی که روی بازار منتشر نمی‌شوند این آمار را ندارند؛ وزنش بین هوش مصنوعی و داوری پخش شده و از بخش بازار فقط حمایت با سکه می‌ماند.",
        ]}
      />
      <Link href="/build" className="btn-ghost inline-flex">🛠️ ساخت محصول ←</Link>
    </Section>
  );
}

function AwardsSection({ prizes, tracks, live }: { prizes: PrizeRow[]; tracks: TrackInfo[]; live: LiveRules }) {
  const trackName = new Map(tracks.map((t) => [t.id, t.name]));
  return (
    <Section id="awards" emoji="🏆" title="جوایز" desc="هر جایزه مبلغ ثابت دارد و از همان ابتدا مشخص است.">
      {prizes.length === 0 ? (
        <p>فهرست جوایز به‌زودی اعلام می‌شود.</p>
      ) : (
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-sm min-w-[480px]">
            <caption className="sr-only">جوایز مسابقه، محور و مبلغ هرکدام</caption>
            <thead>
              <tr className="text-right text-brand-slate border-b border-brand-mist">
                <th scope="col" className="px-3 py-2 font-bold">جایزه</th>
                <th scope="col" className="px-3 py-2 font-bold">محور</th>
                <th scope="col" className="px-3 py-2 font-bold">مبلغ</th>
              </tr>
            </thead>
            <tbody>
              {prizes.map((p) => (
                <tr key={p.id} className="border-b border-brand-mist/60 last:border-0 align-top">
                  <td className="px-3 py-2 font-bold text-brand-navy">
                    <span aria-hidden>{p.emoji}</span> {p.label}
                    {p.kind === "SPECIAL" && <span className="chip-gold !text-xs mr-1.5">جایزهٔ ویژه</span>}
                  </td>
                  <td className="px-3 py-2 text-brand-slate whitespace-nowrap">
                    {trackName.get(p.trackId)}
                    {p.category && ` · ${ENTRY_CATEGORY_LABEL[p.category as EntryCategory] ?? p.category}`}
                  </td>
                  <td className="px-3 py-2 fa-num font-black text-brand-cyan-dark whitespace-nowrap">{formatPrizeAmount(p.amountToman)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="font-bold">هر محصول حداکثر یک جایزهٔ رتبه و یک جایزهٔ ویژه می‌برد.</p>
      <List
        items={[
          "جایزهٔ رتبه از جدول همان محور (و در محور عمومی، همان دسته) خودکار تعیین می‌شود. برگزارکننده می‌تواند جایزهٔ نفر دوم و سوم هم اضافه کند.",
          "جایزهٔ ویژه را کمیته انتخاب می‌کند؛ مثل جذاب‌ترین ایده، بهترین دمو یا انتخاب کمیته.",
          `اگر جایزه‌ای کمتر از ${fa(live.prizeMinEntries)} شرکت‌کننده داشته باشد، برنده باید دست‌کم نمرهٔ داوری ${fa(live.prizeMinJury)} از ۱۰۰ را گرفته باشد؛ وگرنه آن جایزه اهدا نمی‌شود.`,
          "محصولی که ثبت نهایی نشده یا امتیازش صفر است جایزه نمی‌گیرد؛ تیم بدون عضو هم همین‌طور.",
        ]}
      />
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

function OwnershipSection() {
  return (
    <Section id="ownership" emoji="📜" title="مالکیت محصول">
      <List items={[...OWNERSHIP_RULES]} />
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
          "ابزارهای هوش مصنوعی متیس و آتنا در طول مسابقه در اختیار همه قرار می‌گیرند.",
        ]}
      />
    </Section>
  );
}

// پاسخ تابعی با مقادیر مؤثر بازی (تنظیم برگزارکننده) ساخته می‌شود
const FAQ: { q: string; a: React.ReactNode | ((v: GameValues) => React.ReactNode) }[] = [
  {
    q: "باید منتظر زمان خاصی بمانم؟",
    a: "نه. همه‌چیز از اول باز است، فقط ترتیب داخلی تیم حفظ می‌شود: تیم، ایده، محصول، درخواست انتشار. تنها زمان‌بندی، ددلاین نهایی است.",
  },
  {
    q: "یک تیم می‌تواند در چند محور باشد؟",
    a: "بله، با ایده و محصول جدا در هر محور. هر کدام جدا امتیاز می‌گیرد و جدا جایزه می‌برد.",
  },
  {
    q: "تعداد اعضای تیم در امتیاز اثر دارد؟",
    a: "نه. تعداد اعضای تیم در امتیاز هیچ اثری ندارد؛ شرکت فردی، تیم دونفره و تیم سه‌نفره با همان معیارها و همان وزن‌ها امتیاز می‌گیرند.",
  },
  {
    q: "سکه‌هایم تمام شد؛ چه کنم؟",
    a: (v) => (
      <>
        از صفحهٔ «کیف سکه» سکهٔ بیشتر بخر؛ هر سکه {fa(COIN_PRICE_TOMAN)} تومان و حداکثر {fa(v.maxBoughtCoinsPerUser)} سکه برای هر نفر.
      </>
    ),
  },
  {
    q: "با خرید سکهٔ زیاد می‌شود امتیاز خرید؟",
    a: (v) => (
      <>
        نه. از هر نفر برای هر پروژه حداکثر {coins(v.supportCap)} در حمایت با سکه حساب می‌شود و حساب درجه‌دو است؛ پس ده حامی کوچک خیلی
        بیشتر از یک حامی بزرگ می‌ارزند.
      </>
    ),
  },
  {
    q: "می‌توانم از تیم خودم حمایت کنم یا از آن بخرم؟",
    a: "نه. حمایت از ایده و خرید از محصول تیم خودت ممنوع است؛ سکهٔ اعضای خود تیم هم حساب نمی‌شود.",
  },
  {
    q: "ایده‌ای که حمایت کردم عوض شد؛ چه کنم؟",
    a: "تاریخچهٔ تغییرات را در صفحهٔ ایده ببین. اگر نظرت عوض شد، حمایتی را که پیش از آخرین ویرایش داده‌ای پس بگیر تا سکه‌ات کامل برگردد.",
  },
  {
    q: "چطور به یک تیم بپیوندم؟",
    a: "با لینک دعوت خصوصی که یکی از اعضای تیم برایت می‌فرستد، یا با دعوتی که به ایمیلت می‌آید. لینک دعوت فقط به اعضای همان تیم نشان داده می‌شود و آدرس عمومی صفحهٔ تیم برای پیوستن کافی نیست.",
  },
  {
    q: "جایگاه تبلیغاتی را برده بودم ولی از دستم رفت؛ چرا؟",
    a: "جایگاه‌ها مزایده‌ای‌اند و تا شروع بازه هر کس می‌تواند پیشنهاد بالاتری بدهد. در این صورت سکه‌ات کامل به کیفت برمی‌گردد و اعلان می‌گیری.",
  },
  {
    q: "چرا نمرهٔ داوری را در جدول نمی‌بینم؟",
    a: "نمرهٔ داوری تا اعلام نتایج پنهان است تا رقابت تا آخر باز بماند. تا آن موقع جدول فقط امتیاز زندهٔ هوش مصنوعی و بازار را نشان می‌دهد.",
  },
  {
    q: "صفحه‌ای که قبلاً باز بود الان بسته است؛ چرا؟",
    a: "برگزارکننده وضعیت هر بخش را دستی تعیین می‌کند. بخش «وضعیت بخش‌ها» را در همین راهنما ببین.",
  },
];

function FaqSection({ values }: { values: GameValues }) {
  return (
    <Section id="faq" emoji="❓" title="سؤال‌های پرتکرار">
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
      <h2 className="text-xl md:text-2xl font-black">{loggedIn ? "آماده‌ای ادامه بدهی؟" : "آماده‌ای وارد میدان شوی؟"}</h2>
      <p className="mt-1.5 text-sm text-white/80">
        {loggedIn ? "برگرد به اتاق تیمت و قدم بعدی را بردار." : "همین الان ثبت‌نام کن؛ تنها یا با تیمت."}
      </p>
      <Link href={loggedIn ? "/team" : "/register"} className="btn-primary mt-5 inline-flex">
        {loggedIn ? "برو اتاق تیم ←" : "ثبت‌نام ←"}
      </Link>
    </div>
  );
}
