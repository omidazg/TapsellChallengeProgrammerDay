import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getPhase, PHASES, PHASE_LABEL, type Phase } from "@/lib/phase";
import { ROLES, POWERS, DEFAULTS, SCORE_WEIGHTS, AD_SLOT_KINDS, type RoleKey, type PowerKey } from "@/lib/constants";
import { fa, coins } from "@/lib/persian";
import { Container } from "@/components/ui";
import { PRIZES, CASH_PRIZE_TOTAL_MILLION_TOMAN } from "@/lib/prizes";

export const metadata = { title: "راهنمای بازی" };

const TOC: { id: string; label: string; emoji: string }[] = [
  { id: "overview", label: "خلاصهٔ بازی", emoji: "🗺️" },
  { id: "timeline", label: "زمان‌بندی", emoji: "⏳" },
  { id: "roles", label: "نقش‌ها", emoji: "🎭" },
  { id: "powers", label: "قدرت‌ها", emoji: "✨" },
  { id: "wallets", label: "کیف پول‌ها", emoji: "👛" },
  { id: "idea", label: "اتاق ایده", emoji: "💡" },
  { id: "invest", label: "دور سرمایه‌گذاری", emoji: "💰" },
  { id: "build", label: "ساخت محصول", emoji: "🛠️" },
  { id: "market", label: "روز بازار", emoji: "🛒" },
  { id: "adslots", label: "جایگاه تبلیغاتی", emoji: "📣" },
  { id: "auction", label: "حراج زنده", emoji: "🔨" },
  { id: "scoring", label: "امتیازدهی", emoji: "📊" },
  { id: "awards", label: "جوایز", emoji: "🏆" },
  { id: "rules", label: "قوانین و اخلاق", emoji: "⚖️" },
  { id: "faq", label: "سؤالات متداول", emoji: "❓" },
];

const POWER_TIP: Record<PowerKey, string> = {
  HYPE: "نزدیک شروع روز بازار فعالش کن؛ اولین جایگاه «محصول ویژهٔ» شروع‌نشده (یک ساعت کامل) رایگان مال تیمت می‌شود، درست وقتی همه در حال گردش‌اند.",
  BARGAIN: "برای یک خرید گران (یا پیشنهاد حراج) نگه‌دار، نه خریدهای کوچک؛ ده درصد از عدد بزرگ سکهٔ بیشتری برایت می‌ماند.",
  ANGEL: "همان اول دور سرمایه‌گذاری، فهرست ایده‌ها را مرتب کن و کم‌سرمایه‌ترین را پیدا کن تا هم به شرطش برسی و هم زودتر ۲۰ سکه اضافه داشته باشی.",
  SECOND_WIND: "برای حراج نسخهٔ ویژه‌ای که واقعاً می‌خواهی نگه‌دار؛ وقتی شمارش معکوس نزدیک صفر است و رقیب جلو افتاده، فعالش کن.",
  INSIDER: "در اتاق ایده یا همان اول دور سرمایه‌گذاری استفاده کن تا قبل از دیگران بفهمی کدام تیم‌ها سرمایه‌گذار قوی جذب کرده‌اند.",
  SHIELD: "اگر می‌دانی تا آخر بازی مقدار زیادی سکه بلااستفاده می‌ماند، از اول نگهش دار تا در لحظهٔ جمع‌بندی جریمه نخوری.",
};

export default async function GuidePage() {
  const [user, { phase }] = await Promise.all([getCurrentUser(), getPhase()]);

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
            <RolesSection />
            <PowersSection />
            <WalletsSection />
            <IdeaSection />
            <InvestSection />
            <BuildSection />
            <MarketSection />
            <AdSlotsSection />
            <AuctionSection />
            <ScoringSection />
            <AwardsSection />
            <RulesSection />
            <FaqSection />
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
          <h1 className="text-3xl md:text-4xl font-black text-brand-navy leading-[1.3]">راهنمای کامل بازی</h1>
          <p className="mt-3 text-lg text-brand-slate">
            میدان بنیان‌گذاران تپسل یک بازار استارتاپی چهارروزه است: تیم سه‌نفره‌ات ایده می‌دهد، از تیم‌های دیگر سرمایه می‌گیرد، در ۴۸ ساعت محصول می‌سازد، در روز بازار می‌فروشد و در حراج زنده برای نسخهٔ ویژه‌اش می‌جنگد. همهٔ قوانین، اعداد و ترفندهای هر مرحله را همین‌جا پیدا می‌کنی.
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
      <nav className="card p-3">
        <div className="px-2 py-1.5 text-xs font-bold text-brand-slate">فهرست راهنما</div>
        <ul className="space-y-0.5">
          {TOC.map((t) => (
            <li key={t.id}>
              <a href={`#${t.id}`} className="flex items-center gap-2 rounded-2xl px-3 py-2 text-sm font-bold text-brand-navy hover:bg-brand-ice transition">
                <span>{t.emoji}</span>
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

function ExampleBox({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-brand-ice border border-brand-mist p-4">
      <div className="text-xs font-bold text-brand-cyan-dark mb-1.5">{title}</div>
      <div className="text-sm text-brand-navy fa-num">{children}</div>
    </div>
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

function OverviewSection() {
  return (
    <Section id="overview" emoji="🗺️" title="خلاصهٔ بازی">
      <p>
        سه نفر یک تیم می‌سازند و یک استارتاپ خیالی می‌شوند. بازی در چند مرحلهٔ پیوسته پیش می‌رود: اول ایده می‌دهید و تیم‌های دیگر روی ایدهٔ شما سرمایه‌گذاری می‌کنند، بعد با آن سرمایه و زمان محدود محصول را می‌سازید، در روز بازار آن را به بقیهٔ بازیکن‌ها می‌فروشید و در نهایت نسخهٔ ویژهٔ محصول در یک حراج زنده به فروش می‌رسد.
      </p>
      <List
        items={[
          "هر بازیکن یک نقش (سازنده / قصه‌گو / معامله‌گر) و یک قدرت ویژهٔ یک‌بارمصرف دارد.",
          "دو کیف پول شخصی داری: کیف بذر برای سرمایه‌گذاری و کیف خرید برای خرید و حراج.",
          "امتیاز نهایی هر تیم از شش معیار ساخته می‌شود و سکهٔ خرج‌نشده جریمه دارد.",
          "همهٔ تراکنش‌ها عمومی و قابل‌رصد هستند؛ بازی شفاف است.",
        ]}
      />
    </Section>
  );
}

const PHASE_DURATION: Record<Phase, string> = {
  REGISTRATION: "تا شروع بازی",
  IDEATION: "۲۴ ساعت",
  SEED_ROUND: "۲۴ ساعت",
  BUILD: "۴۸ ساعت",
  MARKET: "حدود ۶ ساعت",
  AUCTION: "حدود ۲ ساعت",
  CLOSED: "—",
};

const PHASE_EMOJI: Record<Phase, string> = {
  REGISTRATION: "📝",
  IDEATION: "💡",
  SEED_ROUND: "💰",
  BUILD: "🛠️",
  MARKET: "🛒",
  AUCTION: "🔨",
  CLOSED: "🏁",
};

const PHASE_LIST: readonly Phase[] = PHASES;

function TimelineSection({ phase }: { phase: Phase | null }) {
  return (
    <Section id="timeline" emoji="⏳" title="زمان‌بندی" desc="هفت مرحله، یکی پس از دیگری. وقتی یک مرحله تمام شود، صفحه‌های مربوط به آن فقط‌خواندنی می‌شوند.">
      <div className="rounded-2xl bg-brand-ice border border-brand-mist p-4 grid sm:grid-cols-2 gap-3">
        <div>
          <div className="text-xs font-bold text-brand-cyan-dark mb-1">🧪 فاز تست</div>
          <div className="text-sm text-brand-navy">۴ تا ۱۱ مهر — آزمایشی، بدون تأثیر در نتیجهٔ نهایی.</div>
        </div>
        <div>
          <div className="text-xs font-bold text-brand-cyan-dark mb-1">🚀 شروع رسمی مسابقه</div>
          <div className="text-sm text-brand-navy">۱۱ مهر</div>
        </div>
      </div>
      <ol className="relative border-r-2 border-brand-mist pr-6 space-y-6">
        {PHASE_LIST.map((p) => {
          const current = phase === p;
          return (
            <li key={p} className="relative">
              <span
                className={`absolute right-[-31px] top-0.5 size-4 rounded-full border-2 ${
                  current ? "bg-brand-red border-brand-red" : "bg-white border-brand-mist"
                }`}
              />
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-lg">{PHASE_EMOJI[p]}</span>
                <span className={`font-black ${current ? "text-brand-red" : "text-brand-navy"}`}>{PHASE_LABEL[p]}</span>
                <span className="chip-navy !text-[11px]">{PHASE_DURATION[p]}</span>
                {current && <span className="chip-red !text-[11px]">فاز جاری تو</span>}
              </div>
              <p className="mt-1 text-sm text-brand-slate">{PHASE_DESC_LOCAL[p]}</p>
            </li>
          );
        })}
      </ol>
      {!phase && (
        <p className="text-xs text-brand-slate">برای دیدن فاز جاری خودت، اول وارد حساب کاربری‌ات شو.</p>
      )}
    </Section>
  );
}

// توضیح مفصل‌تر فازها مخصوص راهنما (برچسب‌ها از PHASE_LABEL مشترک می‌آیند)
const PHASE_DESC_LOCAL: Record<Phase, string> = {
  REGISTRATION: "شخصیتت را بساز، تیم سه‌نفره‌ات را کامل کن.",
  IDEATION: "ایده‌ات را با جلد، سقف سرمایه و درصد سود ثبت می‌کنی.",
  SEED_ROUND: "با کیف بذر روی ایده‌های تیم‌های دیگر سرمایه‌گذاری می‌کنی.",
  BUILD: "محصول، تیزر، تصاویر و صفحهٔ محصول را می‌سازید.",
  MARKET: "با کیف خرید از تیم‌های دیگر می‌خری و قلب می‌دهی.",
  AUCTION: "نسخه‌های ویژهٔ محصولات به‌صورت زنده حراج می‌شوند.",
  CLOSED: "سودها پرداخت شده؛ جدول و جوایز نهایی منتشر شده است.",
};

function RolesSection() {
  const roleTip: Record<RoleKey, string> = {
    BUILDER: "بدون سازنده، محصولی برای فروش وجود ندارد؛ زمان فاز ساخت را با او برنامه‌ریزی کن.",
    STORYTELLER: "همان ابتدای فاز ساخت روی تیزر و تصاویر شروع کن؛ این‌ها زمان می‌برند و جزو امتیاز تیزرند.",
    DEALMAKER: "قیمت و درصد سود را زود قفل کن تا سرمایه‌گذارها زمان کافی برای تصمیم داشته باشند.",
  };
  return (
    <Section id="roles" emoji="🎭" title="نقش‌ها" desc="هر تیم سه نفر دارد و هر سه نقش باید در تیم حضور داشته باشند.">
      <div className="grid sm:grid-cols-3 gap-4 stagger">
        {(Object.keys(ROLES) as RoleKey[]).map((r) => (
          <div key={r} className="rounded-2xl border border-brand-mist p-4">
            <div className="text-2xl mb-1.5" aria-hidden>{ROLES[r].emoji}</div>
            <div className="font-black text-brand-navy">{ROLES[r].label}</div>
            <p className="mt-1 text-xs text-brand-slate">{ROLES[r].desc}</p>
            <p className="mt-2 text-xs text-brand-cyan-dark font-bold">{roleTip[r]}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}

function PowersSection() {
  return (
    <Section id="powers" emoji="✨" title="قدرت‌ها" desc="هر بازیکن یک قدرت ویژه دارد که فقط یک‌بار در کل بازی قابل استفاده است.">
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 stagger">
        {(Object.keys(POWERS) as PowerKey[]).map((p) => (
          <div key={p} className="rounded-2xl border border-brand-mist p-4">
            <div className="text-2xl mb-1.5" aria-hidden>{POWERS[p].emoji}</div>
            <div className="font-black text-brand-navy">{POWERS[p].label}</div>
            <p className="mt-1 text-xs text-brand-slate">{POWERS[p].desc}</p>
            <p className="mt-2 text-xs text-brand-cyan-dark font-bold">بهترین زمان استفاده: {POWER_TIP[p]}</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-brand-slate">
        توجه: قدرت «نفس دوم» جداست از قانون خودکار ضد-اسنایپ حراج — وقتی فعالش می‌کنی، {fa(120)} ثانیه (۲ دقیقه) به‌طور دستی به پایان حراج اضافه می‌شود، فقط یک‌بار در کل بازی.
      </p>
    </Section>
  );
}

function WalletsSection() {
  return (
    <Section id="wallets" emoji="👛" title="کیف پول‌ها">
      <div className="grid sm:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-brand-mist p-4">
          <div className="text-xl mb-1" aria-hidden>🌱</div>
          <div className="font-black text-brand-navy">کیف بذر</div>
          <div className="mt-1 text-2xl font-black text-brand-cyan-dark fa-num">{coins(DEFAULTS.seedWallet)}</div>
          <p className="mt-1 text-xs text-brand-slate">فقط در دور سرمایه‌گذاری، برای سرمایه‌گذاری روی ایدهٔ تیم‌های دیگر.</p>
        </div>
        <div className="rounded-2xl border border-brand-mist p-4">
          <div className="text-xl mb-1" aria-hidden>🛒</div>
          <div className="font-black text-brand-navy">کیف خرید</div>
          <div className="mt-1 text-2xl font-black text-brand-red fa-num">{coins(DEFAULTS.buyWallet)}</div>
          <p className="mt-1 text-xs text-brand-slate">در روز بازار برای خرید محصول و در حراج زنده برای پیشنهاد قیمت.</p>
        </div>
        <div className="rounded-2xl border border-brand-mist p-4">
          <div className="text-xl mb-1" aria-hidden>🏦</div>
          <div className="font-black text-brand-navy">خزانهٔ تیم</div>
          <div className="mt-1 text-2xl font-black text-brand-navy">= سرمایهٔ جذب‌شده</div>
          <p className="mt-1 text-xs text-brand-slate">از سرمایه‌گذاری‌های خارجی پر می‌شود؛ فقط برای حراج جایگاه تبلیغاتی خرج می‌شود.</p>
        </div>
      </div>
      <List
        items={[
          `حداکثر ${fa(DEFAULTS.maxPerTarget)} سکه از هر نفر روی یک ایده یا یک محصول قابل سرمایه‌گذاری/خرید است.`,
          "کیف بذر و کیف خرید جدا هستند و قابل تبدیل به هم نیستند.",
          "خزانهٔ تیم جریمهٔ خرج‌نشده ندارد؛ فقط کیف‌های شخصی جریمه می‌شوند.",
        ]}
      />
    </Section>
  );
}

function IdeaSection() {
  return (
    <Section id="idea" emoji="💡" title="اتاق ایده" desc="هر تیم ایده‌اش را با یک جلد و توضیح ثبت می‌کند.">
      <p>در اتاق ایده، تیم یک‌بار برای همیشه (تا پایان فاز) این‌ها را ثبت می‌کند:</p>
      <List
        items={[
          "عنوان، توضیح و جلد ایده.",
          "سقف سرمایه‌ای که می‌خواهید جذب کنید.",
          <>درصد سودی که به سرمایه‌گذاران خارجی می‌دهید (بین {fa(DEFAULTS.minRevenueShare)}٪ تا {fa(DEFAULTS.maxRevenueShare)}٪).</>,
          "در صورت فعال بودن هوش مصنوعی، یک رتبهٔ تحلیل‌گر (وضوح، قابل‌ساخت بودن در ۴۸ ساعت، تازگی) هم نمایش داده می‌شود.",
        ]}
      />
      <ExampleBox title="چرا درصد سود مهم است">
        درصد سود پایین یعنی سود کمتری به سرمایه‌گذارها می‌دهی (سود بیشتر برای خودت می‌ماند)، اما ممکن است سرمایه‌گذارهای کمتری جذب کنی؛ درصد بالا برعکس. باید بین جذب سرمایهٔ بیشتر (معیار ۱۵۰ امتیازی) و سود تیم تعادل برقرار کنی.
      </ExampleBox>
    </Section>
  );
}

function InvestSection() {
  const sales = 200, share = 30, yours = 20, external = 80;
  const dividend = Math.floor(sales * (share / 100) * (yours / external));
  return (
    <Section id="invest" emoji="💰" title="دور سرمایه‌گذاری" desc="با کیف بذر روی ایده‌های تیم‌های دیگر سرمایه‌گذاری می‌کنی و در سود آن‌ها شریک می‌شوی.">
      <List
        items={[
          <>سقف سرمایه‌گذاری روی هر ایده، سرجمع از یک نفر، {fa(DEFAULTS.maxPerTarget)} سکه است.</>,
          "سرمایه‌گذاری روی ایدهٔ تیم خودت مجاز است، اما به‌صورت «خودتأمین» ثبت می‌شود: نه سودی از آن می‌گیری، نه در محاسبهٔ سرمایهٔ خارجی تیم حساب می‌شود.",
          "فقط سرمایه‌گذاری‌های خارجی (غیر خودتأمین) در معیار «جذب سرمایه» و در سود سهام اثر دارند.",
          "اگر قدرت «فرشته» داری، با سرمایه‌گذاری روی کم‌سرمایه‌ترین ایدهٔ بازار، ۲۰ سکهٔ بذر اضافه می‌گیری.",
        ]}
      />
      <ExampleBox title="مثال محاسبهٔ سود سرمایه‌گذار">
        <div className="space-y-1">
          <div>فروش تیم: {coins(sales)} · درصد سود: {fa(share)}٪ · کل سرمایهٔ خارجی: {coins(external)} · سرمایهٔ تو: {coins(yours)}</div>
          <div className="font-black">
            سود تو = {fa(sales)} × {fa(share)}٪ × ({fa(yours)} ÷ {fa(external)}) = {coins(dividend)} (به پایین گرد می‌شود)
          </div>
        </div>
      </ExampleBox>
    </Section>
  );
}

function BuildSection() {
  return (
    <Section id="build" emoji="🛠️" title="ساخت محصول" desc="۴۸ ساعت برای تبدیل ایده به محصول واقعی و یک صفحهٔ فروش جذاب.">
      <List
        items={[
          "محصول یا دمو بسازید (سازنده اصلی این بخش است).",
          "یک تیزر کوتاه (حدود ۶۰ تا ۹۰ ثانیه) و حداقل سه تصویر تهیه کنید.",
          <>قیمت عادی محصول را بین {fa(DEFAULTS.minPrice)} تا {fa(DEFAULTS.maxPrice)} سکه تعیین کنید.</>,
          "یک نسخهٔ ویژه (محدود، برای حراج زنده) را هم تعریف کنید.",
          "صفحهٔ محصول (متن معرفی، تصاویر، تیزر) را کامل کنید؛ داوران و هوش مصنوعی از روی همین صفحه کیفیت را ارزیابی می‌کنند.",
        ]}
      />
    </Section>
  );
}

function MarketSection() {
  return (
    <Section id="market" emoji="🛒" title="روز بازار" desc="با کیف خرید از محصولات تیم‌های دیگر خرید می‌کنی.">
      <List
        items={[
          <>سقف خرید از هر محصول، سرجمع از یک نفر، {fa(DEFAULTS.maxPerTarget)} سکه است.</>,
          "خرید از محصول تیم خودت ممنوع است.",
          "قلب دادن به یک محصول فقط بعد از خرید از آن امکان دارد؛ قلب در معیار «جامعه» اثر می‌گذارد.",
          "تعداد خریداران یکتا هم جزو معیار جامعه حساب می‌شود، نه فقط مجموع فروش.",
        ]}
      />
    </Section>
  );
}

function AdSlotsSection() {
  return (
    <Section id="adslots" emoji="📣" title="جایگاه تبلیغاتی" desc="تیم‌ها با خزانهٔ خودشان برای نمایش بهتر در بازار رقابت می‌کنند.">
      <p>سه نوع جایگاه در هر بازهٔ بازار وجود دارد:</p>
      <div className="grid sm:grid-cols-3 gap-3">
        {(Object.keys(AD_SLOT_KINDS) as (keyof typeof AD_SLOT_KINDS)[]).map((k) => (
          <div key={k} className="rounded-2xl border border-brand-mist p-3 text-center">
            <div className="text-xl mb-1" aria-hidden>{AD_SLOT_KINDS[k].emoji}</div>
            <div className="font-bold text-sm text-brand-navy">{AD_SLOT_KINDS[k].label}</div>
          </div>
        ))}
      </div>
      <List
        items={[
          "هر تیم مخفیانه پیشنهاد قیمت می‌دهد (حراج مهروموم).",
          "تیمی که بالاترین پیشنهاد را داده جایگاه را می‌برد، اما فقط به‌اندازهٔ دومین پیشنهاد بالا (قیمت دوم) از خزانه‌اش پرداخت می‌کند.",
          "اگر خزانهٔ تیم از قیمت دوم کمتر باشد، فقط به‌اندازهٔ موجودی خزانه پرداخت می‌شود.",
          "قدرت «هیاهو» اولین جایگاه «محصول ویژهٔ» آزاد و شروع‌نشده (یک ساعت کامل) را رایگان به تیمت می‌دهد.",
        ]}
      />
    </Section>
  );
}

function AuctionSection() {
  return (
    <Section id="auction" emoji="🔨" title="حراج زنده" desc="نسخه‌های ویژهٔ محصولات یکی‌یکی به‌صورت زنده حراج می‌شوند.">
      <List
        items={[
          "پیشنهادها با کیف خرید ثبت می‌شوند؛ برنده فقط در لحظهٔ بسته شدن حراج (تسویه) واقعاً کیفش کم می‌شود.",
          <>قانون ضد-اسنایپ: اگر پیشنهادی در {fa(DEFAULTS.antiSnipeWindowSec)} ثانیهٔ پایانی ثبت شود، پایان حراج به‌طور خودکار {fa(DEFAULTS.antiSnipeExtendSec)} ثانیه تمدید می‌شود.</>,
          "قدرت «نفس دوم» جدا از این قانون است: هر بازیکن که این قدرت را دارد، یک‌بار در کل بازی می‌تواند دستی ۲ دقیقه به یک حراج اضافه کند.",
          "اگر بودجهٔ کیف خرید برندهٔ نهایی کمتر از پیشنهادش شده باشد (مثلاً به‌خاطر خرید دیگر)، فقط به‌اندازهٔ موجودی فعلی‌اش پرداخت می‌شود.",
        ]}
      />
    </Section>
  );
}

const SCORE_ROWS: { key: keyof typeof SCORE_WEIGHTS; label: string; measures: string; raise: string }[] = [
  { key: "sales", label: "فروش خالص", measures: "مجموع خریدهای محصولت منهای سودی که به سرمایه‌گذاران پرداخت کردی.", raise: "محصول بهتر بساز، قیمت درستی بگذار و در بازار فعال باش." },
  { key: "quality", label: "کیفیت محصول", measures: "نمرهٔ داوران (و در نبود آن، پیش‌نمرهٔ هوش مصنوعی) به محصول و صفحهٔ فروش.", raise: "روی ساخت واقعی و کامل بودن صفحهٔ محصول وقت بگذار." },
  { key: "capital", label: "جذب سرمایه", measures: "مجموع سرمایه‌گذاری‌های خارجی (غیر خودتأمین) روی ایدهٔ تیمت.", raise: "ایده‌ای قابل‌باور با درصد سود منصفانه ارائه بده تا سرمایه‌گذار خارجی جذب کنی." },
  { key: "roi", label: "سود سرمایه‌گذار", measures: "نسبت سودی که به سرمایه‌گذاران خارجی پرداخت کردی به سرمایهٔ جذب‌شده.", raise: "بفروش؛ بدون فروش، سودی برای پرداخت وجود ندارد." },
  { key: "teaser", label: "تیزر", measures: "نمرهٔ داوران به تیزر و ارائهٔ محصول.", raise: "روی قصه‌گویی، تدوین و وضوح تیزر کار کن." },
  { key: "community", label: "جامعه", measures: "تعداد خریداران یکتا (×۱۰) به‌علاوه تعداد قلب‌ها (×۵).", raise: "مشتری‌های متنوع جذب کن، نه فقط چند خرید بزرگ؛ بعد از خرید از آن‌ها بخواه قلب بدهند." },
];

function ScoringSection() {
  const leftoverExample = 10;
  const penaltyExample = leftoverExample * DEFAULTS.penaltyPerCoin;
  return (
    <Section id="scoring" emoji="📊" title="امتیازدهی" desc="امتیاز هر تیم از شش معیار جمع می‌شود؛ هر معیار نسبت به بهترین تیم در همان معیار نرمال می‌شود.">
      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-sm min-w-[560px]">
          <caption className="sr-only">سهم هر معیار امتیازدهی و راه بالابردن آن</caption>
          <thead>
            <tr className="text-right text-brand-slate border-b border-brand-mist">
              <th scope="col" className="px-3 py-2 font-bold">معیار</th>
              <th scope="col" className="px-3 py-2 font-bold">سهم از امتیاز</th>
              <th scope="col" className="px-3 py-2 font-bold">چه چیزی را می‌سنجد</th>
              <th scope="col" className="px-3 py-2 font-bold">چطور بالا ببری</th>
            </tr>
          </thead>
          <tbody>
            {SCORE_ROWS.map((row) => (
              <tr key={row.key} className="border-b border-brand-mist/60 last:border-0 align-top">
                <td className="px-3 py-2 font-bold text-brand-navy whitespace-nowrap">{row.label}</td>
                <td className="px-3 py-2 fa-num font-black text-brand-cyan-dark whitespace-nowrap">{fa(SCORE_WEIGHTS[row.key])}</td>
                <td className="px-3 py-2 text-brand-slate">{row.measures}</td>
                <td className="px-3 py-2 text-brand-slate">{row.raise}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-brand-slate">
        یعنی اگر تیم تو در «فروش خالص» نصفِ بهترین تیم بازار باشد، فقط نصف {fa(SCORE_WEIGHTS.sales)} امتیازِ آن معیار را می‌گیری؛ امتیاز هر معیار همیشه نسبی است، نه مطلق.
      </p>
      <div className="rounded-2xl bg-red-50 border border-red-100 p-4">
        <div className="text-xs font-bold text-brand-red mb-1.5">⚠️ چطور امتیاز صفر می‌گیری (جریمهٔ سکهٔ خرج‌نشده)</div>
        <p className="text-sm text-brand-navy">
          در پایان بازی، هر سکهٔ باقی‌ماندهٔ خرج‌نشده در کیف بذر یا کیف خرید اعضای تیم، {fa(DEFAULTS.penaltyPerCoin)} امتیاز از امتیاز کل تیم کم می‌کند (این نرخ قابل تغییر توسط برگزارکننده است). قدرت «سپر» جریمهٔ تا {fa(10)} سکه از خرج‌نشدهٔ همان بازیکن را حذف می‌کند.
        </p>
        <div className="mt-2 text-sm fa-num">
          مثال: اگر {fa(leftoverExample)} سکه در کیف‌هایت بماند → {fa(penaltyExample)} امتیاز جریمه برای تیمت. پس بهتر است هر دو کیف را تا آخر بازی خرج کنی.
        </div>
      </div>
    </Section>
  );
}

const AWARDS = [
  { emoji: "🏆", label: "قهرمان میدان", desc: "بالاترین امتیاز کل." },
  { emoji: "💰", label: "پرفروش‌ترین", desc: "بیشترین فروش خالص." },
  { emoji: "📈", label: "بهترین جذب سرمایه", desc: "بیشترین سرمایهٔ خارجی جذب‌شده." },
  { emoji: "💎", label: "بهترین سرمایه‌گذار", desc: `بالاترین بازدهی سرمایه‌گذاری فردی، فقط برای کسانی که حداقل ${fa(30)} سکه سرمایه‌گذاری کرده باشند.` },
  { emoji: "❤️", label: "محبوب‌ترین محصول", desc: "بیشترین تعداد قلب." },
  { emoji: "🎬", label: "بهترین تیزر", desc: "بالاترین نمرهٔ داوران به تیزر." },
];

function AwardsSection() {
  return (
    <Section id="awards" emoji="🏆" title="جوایز">
      <div>
        <div className="flex items-baseline justify-between gap-2 mb-3">
          <h3 className="font-black text-brand-navy">جایزهٔ نقدی نهایی</h3>
          <span className="chip-navy !text-xs">مجموعاً {fa(CASH_PRIZE_TOTAL_MILLION_TOMAN, { sep: true })} میلیون تومان</span>
        </div>
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-sm min-w-[420px]">
            <caption className="sr-only">فهرست جوایز نقدی و مبلغ هرکدام</caption>
            <thead>
              <tr className="text-right text-brand-slate border-b border-brand-mist">
                <th scope="col" className="px-3 py-2 font-bold">عنوان جایزه</th>
                <th scope="col" className="px-3 py-2 font-bold">مبلغ (میلیون تومان)</th>
              </tr>
            </thead>
            <tbody>
              {PRIZES.map((p) => (
                <tr key={p.key} className="border-b border-brand-mist/60 last:border-0">
                  <td className="px-3 py-2 font-bold text-brand-navy">{p.label}</td>
                  <td className="px-3 py-2 fa-num text-brand-cyan-dark font-black">{fa(p.amountMillion, { sep: true })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-brand-slate">دسته‌بندی و مبلغ دقیق جوایز ممکن است تا شروع مسابقه توسط برگزارکننده به‌روزرسانی شود.</p>
      </div>

      <h3 className="font-black text-brand-navy mt-6 mb-1">نشان‌های درون‌بازی</h3>
      <div className="grid sm:grid-cols-2 gap-3 stagger">
        {AWARDS.map((a) => (
          <div key={a.label} className="rounded-2xl border border-brand-mist p-4 flex items-start gap-3">
            <div className="text-2xl" aria-hidden>{a.emoji}</div>
            <div>
              <div className="font-black text-brand-navy">{a.label}</div>
              <div className="text-xs text-brand-slate mt-0.5">{a.desc}</div>
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-brand-slate">
        هر تیم حداکثر دو جایزهٔ تیمی می‌تواند ببرد؛ اگر تیمی در بیش از دو معیار برترین باشد، جایزهٔ سوم به تیم بعدی در آن معیار می‌رسد. «بهترین سرمایه‌گذار» جایزهٔ فردی است و در این سقف حساب نمی‌شود.
      </p>
    </Section>
  );
}

function RulesSection() {
  return (
    <Section id="rules" emoji="⚖️" title="قوانین و اخلاق" desc="بازی برای همه عادلانه‌تر می‌شود وقتی این قوانین را رعایت کنی.">
      <List
        items={[
          "خرید از محصول تیم خودت در روز بازار ممنوع است و مسدود می‌شود.",
          <>سرمایه‌گذاری روی ایدهٔ تیم خودت مجاز است اما «خودتأمین» است: بدون سود، بدون اثر در معیار جذب سرمایه.</>,
          <>سقف {fa(DEFAULTS.maxPerTarget)} سکه از هر نفر روی هر ایده یا محصول، تا سرمایه بین تیم‌های بیشتری پخش شود.</>,
          <>هرگونه خرید/سرمایه‌گذاری متقابل زیاد بین دو تیم (در مجموع بیش از {fa(DEFAULTS.collusionThreshold)} سکه) به‌صورت خودکار برای بررسی برگزارکننده علامت می‌خورد؛ این تبانی مشکوک تلقی می‌شود.</>,
          "همهٔ تراکنش‌ها در دفتر کل عمومی ثبت می‌شوند و هر بازیکن می‌تواند سابقهٔ کیف پول خودش و فروش تیم‌های دیگر را ببیند.",
          "ابزارهای هوش مصنوعی متیس و آتنا در اختیار همهٔ شرکت‌کننده‌ها قرار می‌گیرد؛ دسترسی بلافاصله بعد از تکمیل تیم‌بندی (پایان فاز ثبت‌نام) فعال می‌شود، نه از همان ابتدا.",
          "برگزارکننده می‌تواند در مواقع خاص مقادیر پیش‌فرض (مثل نرخ جریمه یا سقف سرمایه‌گذاری) را تغییر دهد؛ همین صفحه همیشه مقادیر فعلی را نشان می‌دهد.",
        ]}
      />
    </Section>
  );
}

const FAQ: { q: string; a: React.ReactNode }[] = [
  {
    q: "کیف بذر و کیف خرید چه فرقی دارند؟",
    a: "کیف بذر فقط در دور سرمایه‌گذاری برای سرمایه‌گذاری روی ایدهٔ تیم‌های دیگر استفاده می‌شود. کیف خرید در روز بازار برای خرید محصول و در حراج زنده برای پیشنهاد قیمت به کار می‌رود. این دو کیف قابل تبدیل به هم نیستند.",
  },
  {
    q: "اگر سکه‌ام را خرج نکنم چه می‌شود؟",
    a: <>هر سکهٔ خرج‌نشدهٔ تو در پایان بازی {fa(DEFAULTS.penaltyPerCoin)} امتیاز از تیمت کم می‌کند؛ پس تلاش کن تا پایان بازی هر دو کیف را خرج کنی. قدرت «سپر» می‌تواند جریمهٔ تا {fa(10)} سکهٔ خرج‌نشده را حذف کند.</>,
  },
  {
    q: "می‌توانم روی تیم خودم سرمایه‌گذاری یا خرید کنم؟",
    a: "سرمایه‌گذاری روی ایدهٔ تیم خودت مجاز است اما به‌صورت «خودتأمین» ثبت می‌شود (بدون سود، بدون اثر در جذب سرمایه). خرید از محصول تیم خودت در روز بازار کاملاً ممنوع است.",
  },
  {
    q: "چرا سقف سرمایه‌گذاری/خرید روی هر هدف وجود دارد؟",
    a: <>برای این‌که سرمایه و فروش بین تیم‌های بیشتری پخش شود، هر نفر حداکثر {fa(DEFAULTS.maxPerTarget)} سکه روی یک ایده یا یک محصول می‌تواند بگذارد.</>,
  },
  {
    q: "سود سرمایه‌گذاری‌ام چطور حساب می‌شود؟",
    a: "سود تو برابر است با: فروش کل تیم × درصد سودی که تیم تعیین کرده × (سهم تو از کل سرمایهٔ خارجی جذب‌شده). نتیجه همیشه به پایین گرد می‌شود.",
  },
  {
    q: "جایگاه‌های تبلیغاتی چطور قیمت‌گذاری می‌شوند؟",
    a: "با حراج قیمت-دوم مهروموم: تیم‌ها مخفیانه پیشنهاد می‌دهند، برنده جایگاه را می‌گیرد اما فقط به‌اندازهٔ دومین پیشنهاد بالا از خزانهٔ تیم پرداخت می‌کند.",
  },
  {
    q: "در حراج زنده اگر لحظهٔ آخر کسی پیشنهاد بدهد چه می‌شود؟",
    a: <>قانون ضد-اسنایپ فعال است: اگر در {fa(DEFAULTS.antiSnipeWindowSec)} ثانیهٔ پایانی پیشنهادی ثبت شود، پایان حراج {fa(DEFAULTS.antiSnipeExtendSec)} ثانیه تمدید می‌شود. جدا از این، دارندهٔ قدرت «نفس دوم» هم می‌تواند یک‌بار ۲ دقیقه دستی اضافه کند.</>,
  },
  {
    q: "پول حراج زنده کِی از کیفم کم می‌شود؟",
    a: "در لحظهٔ پیشنهاد دادن چیزی کم نمی‌شود؛ فقط وقتی حراج بسته می‌شود (تسویه)، از کیف خرید برندهٔ نهایی برداشت می‌شود.",
  },
  {
    q: "چرا رتبهٔ نهایی قبل از پایان بازی پنهان است؟",
    a: "تا لحظهٔ آخر رقابت و راهبرد تیم‌ها حفظ شود، جدول قبل از فاز «پایان بازی» فقط فروش، سرمایه و قلب‌های فعلی را نشان می‌دهد، نه امتیاز کل و رتبه را.",
  },
  {
    q: "اگر تیمم ناقص باشد یا یک نقش را نداشته باشیم چه؟",
    a: "هر تیم باید هر سه نقش (سازنده، قصه‌گو، معامله‌گر) را داشته باشد. در اتاق تیم می‌توانی تیم بسازی یا به تیمی که جا خالی دارد بپیوندی؛ پیش از تکمیل تیم، فازهای بعدی برایت قفل می‌مانند.",
  },
];

function FaqSection() {
  return (
    <Section id="faq" emoji="❓" title="سؤالات متداول">
      <div className="space-y-2.5">
        {FAQ.map((f) => (
          <details key={f.q} className="rounded-2xl border border-brand-mist p-4 group">
            <summary className="cursor-pointer font-bold text-brand-navy list-none flex items-center justify-between gap-3">
              <span>{f.q}</span>
              <span className="text-brand-cyan-dark group-open:rotate-45 transition-transform shrink-0">＋</span>
            </summary>
            <p className="mt-2 text-sm text-brand-slate leading-7">{f.a}</p>
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
        {loggedIn ? "برگرد به اتاق تیمت و قدم بعدی را بردار." : "همین الان ثبت‌نام کن و تیمت را بساز."}
      </p>
      <Link href={loggedIn ? "/team" : "/register"} className="btn-primary mt-5 inline-flex">
        {loggedIn ? "برو اتاق تیم ←" : "ثبت‌نام ←"}
      </Link>
    </div>
  );
}
