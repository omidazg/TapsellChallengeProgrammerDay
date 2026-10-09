# قراردادهای مشترک پروژه (برای همهٔ ایجنت‌ها)

## زبان و ظاهر
- همه‌چیز فارسی و راست‌چین. هیچ متن انگلیسی در UI به‌جز لوگوی پیلارهای گروه پگاه (`@/lib/pillars`، `@/components/PillarLogos`).
- اعداد را با `fa()` از `@/lib/persian` فارسی کنید؛ تاریخ با `jdate/jtime/jdatetime`؛ مدت با `duration`؛ سکه با `coins`.
- پالت تپسل در `globals.css`: قرمز `brand-red` (اکشن اصلی)، آبی `brand-cyan` (اکشن ثانویه/تأکید)، سرمه‌ای `brand-navy` (متن)، `brand-ice/mist/sky` (پس‌زمینه‌های ملایم).
- کلاس‌های آماده: `btn-primary`, `btn-cyan`, `btn-ghost`, `btn-navy`, `card`, `chip`, `chip-ok`, `chip-cyan`, `chip-gold`, `chip-red`, `chip-navy`, `input`, `label`, `anim-rise`, `anim-pop`, `stagger`, `bg-hero`, `bg-dots`.
- کامپوننت‌های مشترک در `@/components/ui`: `PageHeader`, `Container`, `Coin`, `Empty`, `Locked`, `Stat`, `Alert`. آواتار: `@/components/Avatar`. برچسب هوش مصنوعی روی هر کارت ایده/محصول: `<AiTag tag={...} compact? />` از `@/components/AiTag`.
- تصاویر: از `https://picsum.photos/seed/<seed>/800/500` برای جلد و پس‌زمینه‌های نمونه استفاده کنید (بدون کلید). `next.config.ts` این دامنه را مجاز کرده است. برای عناصر تزئینی، SVG درون‌خطی یا CSS.
- انیمیشن: ورود عناصر با `anim-rise`/`stagger`؛ بازخورد اکشن با `anim-pop`. بدون کتابخانهٔ انیمیشن خارجی.

## واژه‌ها و متن قوانین
- «حمایت/حامی» (نه «سرمایه‌گذاری/سرمایه‌گذار»)، «کیف سکه» یا «سکه» (یک کیف واحد)، «شرکت فردی» برای تیم یک‌نفره، «مهارت» برای `ROLES`.
- تنها متن ضدتقلب برای بازیکن: `ANTI_CHEAT_STATEMENT` از `@/lib/rules` (قانون‌های کوتاه: `CORE_RULES`). متن ضدتبانی دیگری ننویسید.
- این مفاهیم دیگر وجود ندارند و نباید در UI بیایند: قدرت‌ها (چانه‌زنی، سپر، فرشته، نفس دوم، هیاهو)، سرپرست تیم و رأی‌گیری، کیف بذر/کیف خرید/خزانهٔ تیم، سود سهام/درصد سود/هدف جذب، جریمهٔ سکهٔ خرج‌نشده، پرتفوی/سلیقه/فروش خالص به‌عنوان معیار امتیاز، فاز جداگانهٔ «حراج زنده»، الزام داشتن هر سه نقش در تیم.

## معماری
- Next.js 16 App Router، React 19، TypeScript strict، Tailwind 4، Prisma 7 + SQLite، zod 4، vitest.
- صفحات سرور هستند (`async` server components) و داده را مستقیم از `prisma` یا توابع `@/lib/*` می‌خوانند. تعامل با **Server Actions** در فایل `actions.ts` کنار هر صفحه (`"use server"`). حراج زنده با SSE (`/api/auction/stream`) و در صورت خطا polling؛ بقیهٔ بخش‌های زنده (نوار فروش، سالن، فاز) با polling هر ۲ تا ۳ ثانیه (بدون WebSocket).
- احراز هویت: `requireUser()` / `getCurrentUser()` / `requireAdmin()` از `@/lib/auth`. هر تغییر ادمین با `audit(...)` از `@/lib/audit` ثبت می‌شود.
- فاز بازی: `getPhase()` از `@/lib/phase` (فهرست و برچسب‌ها در `@/lib/phases`، بدون وابستگی به دیتابیس). فازها: `REGISTRATION → IDEATION → SEED_ROUND → BUILD → MARKET → CLOSED`. فاز قدیمی `AUCTION` در دیتابیس به‌صورت `MARKET` خوانده می‌شود. هر صفحه اگر فازش نرسیده، `<Locked>` نشان می‌دهد؛ اگر گذشته، حالت فقط‌خواندنی. تغییر فاز فقط از `transitionTo()` در `@/lib/phase-transition`.
- ثابت‌ها: `@/lib/constants` (`ROLES` فقط برچسب مهارت، `COIN_PRICE_TOMAN`/`COIN_PRICE_RIAL`/`COIN_PACKAGES`، `DEFAULTS`، `SCORE_WEIGHTS`، `AD_SLOT_KINDS`). مقادیر قابل تغییر با `getSettingInt(key, DEFAULTS.x)` یا یک‌جا با `getEffectiveGameValues()` از `@/lib/game-values` خوانده می‌شوند. کلیدهای تنظیمات برگزارکننده (`SETTING_KEYS` در `@/lib/admin`): `starting_coins`, `support_cap`, `max_bought_coins_per_user`, `bid_increment`, `auction_duration_sec`, `adslot_price_banner`, `adslot_price_featured`, `adslot_price_push`, `adslot_max_per_team`, `market_starts_at`؛ کلیدهای زمان‌بند (`SCHEDULER_SETTING_KEYS`): `auto_advance`, `auto_auction`, `auction_gap_sec`, `phase_hours_IDEATION|SEED_ROUND|BUILD|MARKET`. کلیدهای اقتصادی پس از `REGISTRATION` قفل می‌شوند (`@/lib/settings-lock`).
- **یک کیف سکه**: موجودی بازیکن فقط `User.buyWallet` است. `seedWallet` و `Team.treasury` قدیمی‌اند (صفر/بی‌استفاده) و هرگز نمایش داده نمی‌شوند. سکه‌هایی که برای پیشتازی در حراج زنده رزرو شده‌اند خرج‌پذیر نیستند: برای نمایش از `spendableBuyCoins(userId, buyWallet)` استفاده کنید.
- هر تغییر کیف پول یک `LedgerEntry` (دلیل‌ها: `INVEST`, `PURCHASE`, `AUCTION_WIN`, `ADSLOT`, `COIN_PURCHASE`, `ADMIN`) ثبت می‌کند و در یک `prisma.$transaction` انجام می‌شود. برچسب فارسی با `LEDGER_REASON_LABEL` و `WALLET_LABEL` از `@/lib/scoring` (ردیف‌های قدیمی `BID_HOLD/BID_RELEASE/DIVIDEND/PENALTY/POWER_ANGEL` هم برچسب دارند).
- **سرپرست وجود ندارد**: هر عضو تیم (و شرکت‌کنندهٔ فردی) کارهای تیمی را انجام می‌دهد. دسترسی را با `teamAccess(user)` / `teamManageError(user)` از `@/lib/team-access` بسنجید (تنها خطا: کاربر تیم ندارد).
- اعتبارسنجی ورودی با `zod`. خطاها به‌صورت `{ error: "متن فارسی" }` (یا `{ ok: false, error }`) از اکشن برگردند؛ صفحه با `<Alert kind="error">` نشان دهد.
- هوش مصنوعی: `askText/askJson/askChat` از `@/lib/ai`؛ در نبود کلید `null` برمی‌گردد و UI باید بدون آن کار کند.
- هیچ فایل خارج از حوزهٔ خودتان را تغییر ندهید مگر `CONTRACTS.md` خلاف آن بگوید. `schema.prisma` را تغییر ندهید؛ اگر فیلدی لازم دارید در گزارش نهایی بنویسید.

## ماژول‌های کتابخانه (`src/lib`)
ماژول‌هایی که با «کلاینت» مشخص شده‌اند به دیتابیس وابسته نیستند و در کامپوننت‌های کلاینت هم قابل استفاده‌اند.

### بازی، فاز و تنظیمات
- `phases.ts` (کلاینت): `PHASES`, `Phase`, `PHASE_LABEL`, `PHASE_DESC`, `phaseIndex`, `phaseAtLeast`.
- `phase.ts`: همهٔ `phases.ts` به‌علاوهٔ `getPhase()` → `{ phase, endsAt }`, `setPhase`, `getSetting`, `getSettingInt`, `getSettingFloat`.
- `phase-transition.ts`: `transitionTo(phase, endsAt)` → `{ settleFailed? }` — اعلان سراسری؛ در `CLOSED` حراج‌ها را می‌بندد (`closeAuctionsForGameEnd`) و `settleGame()` را اجرا می‌کند.
- `scheduler.ts`: `runScheduledTasks()` (هر ۳۰ ثانیه از `instrumentation.ts`: پیشروی خودکار فاز، تسویهٔ حراج تمام‌شده و شروع خودکار حراج بعدی صف در `MARKET`، ارسال اعلان جایگاه‌های PUSH)، `getLastSchedulerTickAt`, `cleanupOldNotifications`.
- `constants.ts` (کلاینت): بالا را ببینید.
- `game-values-core.ts` (کلاینت): `GameValues` (= `typeof DEFAULTS`)، `GAME_VALUE_SETTINGS`, `mergeGameValues`؛ `game-values.ts`: `getEffectiveGameValues()`.
- `admin.ts`: `getAdminCounts`, `SETTING_KEYS`, `SETTING_LABELS`, `getSettingsMap`, `setSetting`, `SCHEDULER_SETTING_KEYS/LABELS/KINDS`, `getSchedulerSettingsMap`, `detectAndFlagCollusion()`.
- `settings-lock.ts` (کلاینت): `LOCKED_AFTER_START_KEYS`, `areEconomySettingsLocked(phase)`, `lockedSettingChanges`, `withoutLockedKeys`؛ `settings-schema.ts`: `parseGameSettings`, `parseSchedulerSettings`, `saveSettings`.
- `rules.ts` (کلاینت): `ANTI_CHEAT_STATEMENT`, `CORE_RULES`.

### تیم
- `team.ts`: `TEAM_FULL` (= ۳)، `createTeamForUser`, `goSolo(userId)` (شرکت فردی: `Team.solo = true`، بسته به عضو جدید)، `openSoloTeam(userId)` (باز کردن دوباره)، `joinMatchmaking`, `inviteToTeam`, `acceptInvite`, `declineInvite`, `joinBySlug`, `getTeamPreviewBySlug`, `leaveTeam`, `getTeamWithMembers`, `roleCoverage` (فقط نمایش مهارت‌ها)، ابزار ادمین `adminMoveUserToTeam`, `adminMergeTeams`, `autoComposeTeams`. همه `{ ok?, error? }` برمی‌گردانند.
- `team-access.ts`: `teamAccess(user)` → `{ canManage, reason }`، `teamManageError(user)` → `string | null`.
- `team-settings.ts`: `updateTeamSettings(actorId, { name, shuffleLogo? })` (هر عضو، تا پایان `IDEATION`)، `isTeamSettingsOpen()`, `teamSettingsPhaseOpen(phase)`, `updateSkill(userId, role)`.

### سکه، پرداخت و صندوق جایزه
- `coins.ts`: `createCoinOrder(userId, coins, callbackBase)` → `{ ok: true, orderId, next: { kind: "redirect", url, authority } | { kind: "manual" } } | { ok: false, error }`؛ `verifyCoinOrder(gateway, authority, params)` → `{ ok: true, orderId, coins, alreadyPaid } | { ok: false, error, orderId? }` (اعتبار idempotent)؛ `cancelCoinOrder(userId, orderId)`؛ `boughtOrPendingCoins(userId)` → `{ paid, pending }`؛ `getPaymentDriver()` → `PaymentDriver { name, online, start, verify }`؛ `fakePaymentAllowed()`؛ `coinsToRial`, `coinsToToman`؛ ادمین: `adminMarkOrderPaid(orderId, note)`, `adminRejectOrder(orderId, note)`, `MANUAL_INSTRUCTIONS_KEY`, `getManualInstructions()`. مدل `CoinOrder { id, userId, coins, amountRial, status: PENDING|PAID|FAILED|CANCELED, gateway, authority?, refId?, note, createdAt, paidAt? }`. درایورها و متغیرهای محیطی: `docs/ops.md` بخش ۹.
- `prizes.ts` (کلاینت): `PRIZES` (پنج جایزه با `key, label, emoji, sharePct, criterion, how: "auto"|"pick"`)، `PrizeKey`, `PrizePool`, `prizePoolFrom(toman)`, `prizeAmountMillion(pool, sharePct)`, `formatMillion`, `PRIZE_POOL_BASE_MILLION_TOMAN` (= ۲۰۰۰).
- `prize-pool.ts`: `getPrizePoolCached()` (۳۰ ثانیه)، `getPrizePool()`, `coinSales()` → `{ toman, coins, orders }`.

### خرج کردن سکه
- `invest.ts` (دور حمایت): `investCore(prisma, userId, ideaId, amount)` → `{ ok: true, investmentId, selfFunded } | { ok: false, error }`، `investedByUserOnIdea`, `totalInvestedByUser`, `validateInvestment`. حمایت از تیم خود ممنوع؛ سقفی روی هدف نیست؛ کاربر بی‌تیم هم می‌تواند حمایت کند.
- `idea.ts`: `IdeaCardData` / `IdeaDetail` (شامل `aiTag`)، `getIdeasForFloor(filter)`, `FLOOR_FILTERS`, `parseFloorFilter`, `getIdeaDetail(id, viewerId)`, `raisedFor`, `isHttpUrl`.
- `market.ts` (روز بازار): `getMarketProducts(sort, viewer?)` → `MarketCard[]` (با `live` و `bought`)، `purchaseProduct(userId, productId)` → `{ ok: true, purchaseId, amount } | { ok: false, error }` (قیمت کامل، بدون سقف)، `spendableBuyCoins`, `salesSummary`, `userSpentOn`, `getBuyers`, `hasPurchased`, `hasHearted`, `getCurrentAdSlotWinners`, `getTicker`, `validatePurchase`.
- `auction.ts` (حراج داخل روز بازار): `enqueueAuction(userId)` → `{ ok: true, auctionId, position } | { ok: false, error }` (هر عضو تیم؛ تا `auctionEnqueueCutoffMin` دقیقه پیش از پایان `MARKET`)، `placeBid(auctionId, userId, amount)`, `getBidBudget`, `getAuctionState`, `getPublicAuctionState`, `listAuctions`, `currentOrNextAuctionId`, `getLiveAuctionIdCached`, `startNextAuction`, `settleAuction`, `settleIfEnded`, `closeAuctionsForGameEnd`، ابزار ادمین `ensureAuctions()` (همهٔ محصولات باقی‌مانده را به ته صف می‌افزاید)، `clampAuctionDuration`, `shuffleOrder`. برد حراج یک `Purchase` می‌سازد. `auction-events.ts`: پخش SSE (`auctionBroadcaster`, `publishAuctionChange`). `reservations.ts`: `reservedBuyCoins(tx, userId, excludeAuctionId?)`.
- `adslots.ts` (ساخت محصول + روز بازار، قیمت ثابت، اول‌آمده‌اول‌برده): `buyAdSlot(userId, slotId)` → `{ ok: true, price } | { ok: false, error }`، `adSlotPrices()` → `{ BANNER, FEATURED, PUSH }`، `slotsGrid(myTeamId)` → `SlotCell { id, kind, hourStart, state: "OPEN"|"SOLD"|"PAST", price, winnerTeamId, winnerTeamName, pricePaid, mine }[]`، `ensureAdSlots`, `marketStartFromSettings`, `currentAdWinners`, `sendDuePushSlots`. سقف هر تیم `adslot_max_per_team`؛ نیازمند محصول ثبت‌شده؛ اثری در امتیاز ندارد.

### محصول، هوش مصنوعی و انتشار
- `product.ts`: `getProductForTeam`, `getProductBySlug` → `ProductDetail` (با `aiQuality`, `aiNotes`)، `effectiveMaxPrice` + همهٔ `product-utils.ts` (کلاینت: تصاویر، تیزر، چک‌لیست ثبت).
- `ai-tag.ts` (کلاینت): `ideaAiTag(idea)`, `productAiTag(product)` → `AiTagInfo { level, label, score, summary } | null`، `aiTagLevel`, `AI_TAG_LABEL`, `AI_TAG_THRESHOLDS`.
- `analyst.ts`: `runAnalyst(ideaId)` (پس از ثبت ایده)؛ `jury-ai.ts`: `runJuryAi(productId)` (پس از ثبت محصول، `aiQuality` ۰ تا ۱۰۰)؛ `ai-budget.ts`: سقف هزینهٔ روزانه و پیام‌های دستیار؛ `assistant-context.ts`: `buildAssistantContext(values, pool)`.
- `studio.ts` (انتشار روی بازار استودیو، اختیاری): `requestGoLive(user, { sourceUrl, note })`, `cancelGoLive(user)`, `adminSetLiveStatus(productId, { status, liveUrl, note })`, `listStudioRequests()`, `LIVE_STATUS_LABEL`, `LiveStatus = "" | "REQUESTED" | "PUBLISHING" | "LIVE" | "REJECTED"`.

### امتیاز، جوایز و تسویه
- `economy/types.ts` و `economy/engine.ts` (خالص، با تست): `scoreGame(config, teams)`, `juryRawScore`, `peopleSupport` (`(Σ √min(سکهٔ هر نفر، سقف))²`، بدون اعضای تیم)، `validateInvestment`, `validatePurchase`, `nextMinBid`, `shouldExtendAuction`, `defaultConfig`. تعداد اعضای تیم در امتیاز هیچ اثری ندارد؛ `juryAdjusted` همان `juryRaw` است (داوری‌نشده = ۰). `TeamResult { teamId, memberCount, juryRaw, juryAdjusted, people, supporters, coinsReceived, ai, cheatPenalty, pts: { jury, people, ai }, total, rank? }`.
- `scoring.ts`: `computeScores()`, `computeScoresCached()` (۱۵ ثانیه؛ تسویه همیشه از نسخهٔ خام)، `configFromSettings`, `computeAwards(output, { teamNames, picks })` → `Award[]`، `getAwardPicks()`, `AWARD_PICK_KEYS = { ai: "award_ai_team_id", live: "award_live_team_id" }`, `LEDGER_REASON_LABEL`, `WALLET_LABEL`.
- `score-labels.ts` (کلاینت): `SCORE_CATEGORY_ORDER`, `SCORE_CATEGORY_LABELS`, `SCORE_CATEGORY_JUDGE`, `SCORE_CATEGORY_MEASURES`, `SCORE_CATEGORY_TIPS`.
- `settlement.ts`: `settleGame()` → `{ alreadySettled, teams, settledAt }` (idempotent، فقط تثبیت امتیازها در `TeamScore`)، `getSettledAt()`, `loadSettledOutput()`, `SETTLED_AT_KEY`.
- `hall.ts`: `getHallPayloadCached()` — پیش از `CLOSED` فقط «تعداد حامی» (`supporters`، برابری با `coinsReceived`)، پس از آن امتیاز کل.

### زیرساخت
- `auth.ts`, `audit.ts`, `whitelist.ts`, `otp.ts`, `sms.ts`, `phone.ts`, `rate-limit.ts`, `notifications.ts` (`notifyUser/Users/Team/All`، اطلاعیه‌ها)، `push.ts`, `feed.ts`, `timeline.ts`, `badges.ts`, `analytics.ts`, `uploads.ts`, `thumb.ts`, `ttl-cache.ts` (`cached`, `invalidate`)، `log.ts`, `alert.ts`, `persian.ts`, `pillars.ts`, `clipboard.ts`, `db.ts`.

### ماژول‌های حذف‌شده (دوباره نسازید)
- `src/lib/leader.ts` (سرپرست/رأی‌گیری) ← `team-access.ts`؛ `src/lib/loadout.ts` (انتخاب قدرت)؛ `src/lib/shield.ts` و `src/lib/shield-reminders.ts`؛ کامپوننت‌های `LeaderNotice`, `LoadoutPicker`, `UnspentReminder`.
- توابع حذف‌شده: `activateSecondWind`، مزایدهٔ جایگاه تبلیغاتی (`upsertBid`, `closeSlot`, `closeDueSlots`, `claimHypeSlot`)، `POWERS`/`PowerKey`، `lowestRaisedIdea*`، فیلدهای `fundingCap`/`revenueShare` در داده‌های ایده (ستون‌ها در دیتابیس می‌مانند و هنگام ساخت ۰ نوشته می‌شوند). ستون `User.power` قدیمی است و نمایش داده نمی‌شود.

## مسیرها (App Router)
- `/` فرود · `/register` · `/login` · `/access-request` · `/profile` · `/team` (+ `/team/settings`، `/join/[slug]`) · `/idea` · `/invest` (+ `/invest/[ideaId]`؛ صفحهٔ «دور حمایت») · `/build` (محصول + درخواست انتشار استودیو) · `/market` (+ `/market/[slug]`) · `/auction` (حراج زندهٔ روز بازار) · `/adslots` · `/wallet` · `/coins` (خرید سکه؛ `/coins/callback` بازگشت از درگاه، `/coins/fake-gateway` درگاه آزمایشی) · `/leaderboard` · `/results` (+ `/results/[teamId]/report`) · `/hall` (نمای پروژکتور) · `/guide` · `/notifications` · `/survey` · `/admin/*` (از جمله `/admin/coins` سفارش‌های سکه، `/admin/studio` درخواست‌های انتشار، `/admin/jury` داوری و انتخاب جوایز، `/admin/teams` تیم‌ها و کسر امتیاز تقلب، `/admin/auction` صف حراج، `/admin/settlement` تسویه).
- API: `/api/phase`, `/api/health`, `/api/market/ticker`, `/api/auction/[id]/state`, `/api/auction/live`, `/api/auction/stream` (SSE)، `/api/hall`, `/api/feed`, `/api/notifications`, `/api/push/*`, `/api/upload`, `/api/assistant`.

## کیفیت
- `npx tsc --noEmit` و `npm run lint` باید پاک باشد. موتور امتیاز و ماژول‌های خالص با `npx vitest run` تست می‌شوند؛ دود-تست‌ها با `npm run smoke` (هر کدام روی دیتابیس موقت خودش).
