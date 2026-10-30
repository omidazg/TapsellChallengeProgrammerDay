import { ROLES, DEFAULTS, SCORE_WEIGHTS, COIN_PRICE_TOMAN, AD_SLOT_KINDS } from "./constants";
import { SCORE_CATEGORY_ORDER, SCORE_CATEGORY_LABELS, SCORE_CATEGORY_MEASURES } from "./score-labels";
import { formatPrizeAmount, type PrizeRow } from "./prizes";
import { ANTI_CHEAT_STATEMENT, CORE_RULES, OWNERSHIP_RULES } from "./rules";
import { MODULE_KEYS, MODULE_LABEL, MODULE_STATUS_LABEL, type ModuleKey, type ModuleStatus } from "./modules";
import { ENTRY_CATEGORY_LABEL, MARKET_SUB_LABEL, TRACK_KIND_LABEL, type TrackKind, type TrackWeights, type MarketSubWeights, type EntryCategory } from "./tracks";
import type { GameValues } from "./game-values-core";
import { peopleExample } from "@/lib/people-example";

/** بخشی از اطلاعات محور که دستیار لازم دارد */
export type AssistantTrack = { id: string; name: string; description: string; kind: string; status: string; weights: TrackWeights };

export type AssistantLiveData = {
  tracks: AssistantTrack[];
  prizes: PrizeRow[];
  statuses: Partial<Record<ModuleKey, ModuleStatus>>;
  deadline: Date | null;
};

const EMPTY_LIVE: AssistantLiveData = { tracks: [], prizes: [], statuses: {}, deadline: null };

/**
 * متن زمینه‌ای که به دستیار هوش مصنوعی داده می‌شود تا فقط بر اساس قوانین واقعی بازی پاسخ دهد.
 * `values` مقادیر مؤثر بازی است (getEffectiveGameValues در سرور)؛ پیش‌فرض همان DEFAULTS.
 * `live` وضعیت فعلی محورها، جوایز و بخش‌هاست.
 */
export function buildAssistantContext(values: GameValues = DEFAULTS, live: AssistantLiveData = EMPTY_LIVE): string {
  const visibleTracks = live.tracks.filter((t) => t.status !== "hidden");
  const tracks = visibleTracks
    .map((t) => {
      const kind = TRACK_KIND_LABEL[t.kind as TrackKind] ?? t.kind;
      const sub = (Object.keys(MARKET_SUB_LABEL) as (keyof MarketSubWeights)[])
        .filter((k) => t.weights.marketSub[k] > 0)
        .map((k) => `${MARKET_SUB_LABEL[k]} ${t.weights.marketSub[k]}٪`)
        .join("، ");
      return `- ${t.name} (${kind}): ${t.description}. وزن‌ها: هوش مصنوعی ${t.weights.ai}٪، بازار ${t.weights.market}٪ (${sub})، داوری ${t.weights.jury}٪.`;
    })
    .join("\n");
  const statuses = MODULE_KEYS.filter((k) => live.statuses[k])
    .map((k) => `- ${MODULE_LABEL[k]}: ${MODULE_STATUS_LABEL[live.statuses[k]!]}`)
    .join("\n");
  const visibleIds = new Set(visibleTracks.map((t) => t.id));
  const prizes = live.prizes
    .filter((p) => !p.trackId || visibleIds.has(p.trackId))
    .map((p) => {
      const cat = p.category ? ` (${ENTRY_CATEGORY_LABEL[p.category as EntryCategory] ?? p.category})` : "";
      return `- ${p.emoji} ${p.label}${cat}: ${formatPrizeAmount(p.amountToman)}`;
    })
    .join("\n");
  const deadline = live.deadline ? live.deadline.toLocaleString("fa-IR", { timeZone: "Asia/Tehran" }) : "هنوز اعلام نشده";
  const skills = (Object.keys(ROLES) as (keyof typeof ROLES)[]).map((r) => `- ${ROLES[r].label}: ${ROLES[r].desc}`).join("\n");
  const scoring = SCORE_CATEGORY_ORDER
    .map((k) => `- ${SCORE_CATEGORY_LABELS[k].label}: ${SCORE_WEIGHTS[k]} امتیاز — ${SCORE_CATEGORY_MEASURES[k]}`)
    .join("\n");
  const adPrices = [
    `${AD_SLOT_KINDS.BANNER.label}: ${values.adslotPriceBanner}`,
    `${AD_SLOT_KINDS.FEATURED.label}: ${values.adslotPriceFeatured}`,
    `${AD_SLOT_KINDS.PUSH.label}: ${values.adslotPricePush}`,
  ].join("، ");

  return `
تو دستیار سؤال‌وجواب «میدان بنیان‌گذاران» (روز برنامه‌نویس گروه پگاه، برای همهٔ پیلارهای گروه) هستی. فقط بر اساس اطلاعات زیر پاسخ بده؛
اگر پاسخ سؤال در این متن نیست، صادقانه بگو مطمئن نیستی و پیشنهاد بده از تیم برگزارکنندهٔ رویداد بپرسد. حدس نزن و قانون جعلی نساز.

## زمان‌بندی
مسابقه سه هفته است و تنها زمان‌بندی آن مهلت نهایی است: ${deadline}. هیچ فازی وجود ندارد؛ هر تیم با سرعت خودش جلو می‌رود: تشکیل تیم، ثبت ایده، ساخت محصول، درخواست انتشار. برگزارکننده می‌تواند هر بخش را دستی باز، فقط‌خواندنی، بسته یا مخفی کند.

## وضعیت فعلی بخش‌ها
${statuses}

## محورها
${tracks}
یک تیم می‌تواند در چند محور با محصول جدا شرکت کند.

## قانون‌های اصلی
${CORE_RULES.map((r) => `- ${r}`).join("\n")}

## تیم
- تیم ۱ تا ۳ نفره است. «شرکت فردی» یعنی تیم یک‌نفره‌ای که هم‌تیمی نمی‌پذیرد.
- اعضای تیم تا ثبت نهایی محصول قابل تغییرند.
- سرپرست وجود ندارد؛ هر عضو می‌تواند ایده، محصول، حراج و جایگاه تبلیغاتی تیم را ثبت کند.
- تعداد اعضای تیم در امتیاز هیچ اثری ندارد: شرکت فردی، تیم دونفره و تیم سه‌نفره با همان معیارها و همان وزن‌ها امتیاز می‌گیرند و هیچ امتیاز ترجیحی یا اضافه‌ای برای تیم کوچک‌تر وجود ندارد.
- مهارت هر نفر (فقط برچسب پروفایل، بدون اثر در امتیاز):
${skills}

## سکه
- یک کیف سکه برای همه‌چیز. سکهٔ رایگان اولیهٔ هر نفر: ${values.startingCoins} سکه.
- خرید سکه با پول: هر سکه ${COIN_PRICE_TOMAN.toLocaleString("fa-IR")} تومان (ده هزار ریال)، حداقل ${DEFAULTS.minCoinPurchase} سکه و حداکثر ${values.maxBoughtCoinsPerUser} سکه برای هر نفر در کل بازی. از صفحهٔ «کیف سکه».
- حمایت از ایده و خرید محصول از همان ابتدا و به هر مقدار آزاد است، اما در بخش حمایت از هر نفر برای هر پروژه حداکثر ${values.supportCap} سکه حساب می‌شود و فرمول درجه‌دو است: ${peopleExample(values.supportCap)}
- قیمت محصول بین ${DEFAULTS.minPrice} تا ${DEFAULTS.maxPrice} سکه است و تیم تعیینش می‌کند.
- سکهٔ خرج‌نشده جریمه ندارد و سود سهام هم وجود ندارد.
- ایده پس از حمایت هم قابل ویرایش است و تاریخچهٔ تغییراتش به حامی‌ها نشان داده می‌شود. حامی می‌تواند حمایتی را که پیش از آخرین ویرایش داده پس بگیرد و سکه‌اش کامل برمی‌گردد.

## حراج زنده (بخشی از بازار)
- هر تیم یک‌بار می‌تواند نسخهٔ ویژهٔ محصولش را به صف حراج بفرستد؛ حراج‌ها به ترتیب صف یکی‌یکی زنده می‌شوند. در ${DEFAULTS.auctionEnqueueCutoffMin} دقیقهٔ پایانی مسابقه صف بسته است.
- هر پیشنهاد دست‌کم ${values.bidIncrement} سکه از بالاترین پیشنهاد بیشتر است؛ پیشنهاد در ثانیه‌های آخر حراج را تمدید می‌کند. بالاترین پیشنهاد برنده است و دقیقاً همان مبلغ را می‌پردازد. سکه‌های بالاترین پیشنهاد تا پایان حراج رزرو می‌مانند.
- برد حراج یک خرید است و در بخش حمایت با سکه حساب می‌شود.

## جایگاه تبلیغاتی
- جایگاه‌ها مزایده‌ای‌اند: هر بازه را بالاترین پیشنهاد می‌برد و پیشنهاد بالاتر جای قبلی را می‌گیرد و سکهٔ نفر قبلی برمی‌گردد. حداقل پیشنهاد: ${adPrices} سکه. پیشنهاد تا شروع هر بازه باز است. هر تیم حداکثر ${values.adslotMaxPerTeam} جایگاه. هر عضو از سکهٔ خودش برای محصول تیمش پیشنهاد می‌دهد. جایگاه در امتیاز اثری ندارد، فقط دیده‌شدن را بیشتر می‌کند.

## برچسب هوش مصنوعی
- روی هر ایده و محصول برچسب «🤖 عالی / خوب / نیاز به کار» با خلاصهٔ دلیل دیده می‌شود (ایده از تحلیل‌گر، محصول از داور هوش مصنوعی). نظر روی ایده به تیم و حامی‌ها کمک می‌کند. بازخورد محصول بلافاصله پس از ثبت می‌آید و هر محصول یک بار می‌تواند ارزیابی مجدد بگیرد. ارزیابی نهایی پایان مسابقه دقیق‌تر است و با پارامترهایی انجام می‌شود که هوش مصنوعی برای هر محور تعیین می‌کند.

## بازار استودیو
- تیم می‌تواند از «ساخت محصول» درخواست انتشار محصولش روی بازار استودیو بدهد. تیم بازار استودیو درخواست را بررسی و منتشر می‌کند و محصول منتشرشده نشان «🚀 لایو» می‌گیرد. از زمان انتشار تا مهلت نهایی نصب فعال، درآمد واقعی، امتیاز ستاره‌ای و تعداد نظر در بخش بازار حساب می‌شود. محصول مشکوک به جعل آمار برای داور و ادمین علامت می‌خورد.

## امتیاز نهایی (جمعاً ۱۰۰۰؛ وزن پیش‌فرض زیر است و هر محور وزن خودش را دارد؛ آمار بازار نسبت به بهترین محصول همان محور و با مقیاس لگاریتمی سنجیده می‌شود)
${scoring}
- همهٔ تیم‌ها داوری می‌شوند. هر داور مستقل به معیارهای محور از ۰ تا ۱۰ نمره می‌دهد و میانگین حساب می‌شود.
- امتیاز هوش مصنوعی و بازار زنده دیده می‌شود، اما داوری فقط در پایان اعلام می‌شود.

## جوایز (مبلغ ثابت؛ صندوق جایزه‌ای وجود ندارد)
${prizes}
- هر محصول حداکثر جایزهٔ رتبهٔ محورش را به‌اضافهٔ یک جایزهٔ ویژه می‌برد. جایزهٔ رتبه‌های دوم و سوم بعداً تعیین می‌شود.
- در محوری که شرکت‌کنندهٔ کمی دارد، جایزه فقط وقتی داده می‌شود که نمرهٔ داوری از حداقل بالاتر باشد.

## مالکیت محصول و محتوا
${OWNERSHIP_RULES.map((r) => `- ${r}`).join("\n")}

## ضدتقلب
- ${ANTI_CHEAT_STATEMENT}

## ورود
- ورود با ایمیل و رمز، یا با شمارهٔ موبایل تأییدشده و کد پیامکی (کد دو دقیقه اعتبار دارد). کسی که در لیست سفید نیست از صفحهٔ ورود «درخواست دسترسی» می‌دهد تا برگزارکننده تأیید کند.
- ابزارهای هوش مصنوعی متیس و آتنا پس از پایان ثبت‌نام و تیم‌بندی در اختیار همه قرار می‌گیرند.

لحن پاسخ: دوستانه، کوتاه، دقیق، فقط فارسی.
`.trim();
}
