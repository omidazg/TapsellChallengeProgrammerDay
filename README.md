# TapsellChallengeProgrammerDay — Founders Arena (میدان بنیان‌گذاران)

A Persian, right-to-left web game for Pegah Group's Programmer Day. Players form tiny startups,
pitch an idea, build a product and sell it on a one-day market. Everything runs on coins.

Stack: Next.js 16 (App Router), React 19, TypeScript, Prisma 7 + SQLite, Tailwind 4, zod 4, vitest.

## The game in one minute

- **Teams of 1–3.** A one-person team is a «شرکت فردی» (solo company, closed to new members).
  There is no team leader and no voting: every member can manage the idea, the product, the
  auction entry, ad slots and the Bazaar Studio request. The skill tag (سازنده / قصه‌گو / معامله‌گر)
  is just a profile label with no effect on the game.
- **Phases:** ثبت‌نام و تیم (`REGISTRATION`) → اتاق ایده (`IDEATION`) → دور حمایت (`SEED_ROUND`) →
  ساخت محصول (`BUILD`) → روز بازار (`MARKET`) → پایان بازی (`CLOSED`). The live auction is part of the
  market day. It is not a separate phase.
- **One coin wallet («کیف سکه»).** Everyone starts with 200 free coins (setting `starting_coins`).
  Coins are spent on:
  - supporting other teams' ideas in the support round (no cap per idea, no dividends);
  - buying products at full price on market day;
  - bidding in the live auction on market day (coins you are currently winning with are reserved);
  - fixed-price ad slots (banner, featured card, push) during build and market, first come first served.

  Supporting or buying from your own team is forbidden. Unspent coins carry no penalty.
- **Buying coins.** 1 coin = 1,000 toman (10,000 rial). There are suggested packages of 20, 50, 100 and
  200 coins, or you can enter any amount. The minimum is 10 coins and each person can buy at most
  1,000 (setting `max_bought_coins_per_user`; paid and pending orders both count). Every paid order is
  added to the prize pool.
- **Prize pool** = 2,000 million toman base + all paid coin sales. There are five prizes, and each
  project wins at most one:

  | Prize | Share | How the winner is chosen |
  |---|---|---|
  | 🏆 بنیان‌گذار برتر | 35% | highest total score |
  | 🛠️ انتخاب داوران | 20% | highest human-jury score |
  | 🤖 برترین کاربرد هوش مصنوعی | 15% | picked by the jury |
  | ❤️ انتخاب مردم | 15% | highest people-support score |
  | 🚀 بهترین محصول لایو | 15% | picked by the jury among products live on Bazaar Studio |

- **Scoring (1,000 points)** has three criteria. Each one is normalised to the best project, and any
  cheat penalty is then subtracted:
  - human jury («داوری انسانی») — 500 points. Jurors answer three questions, each scored 0–10: does it
    really work, its real value for users or Pegah Group, and the teaser and pitch. The raw score is
    the mean × 10. Team size (1–3 people, or a solo entry) makes no difference to any score;
  - people support («حمایت مردمی») — 300 points. This uses quadratic funding over idea supports,
    product purchases and auction wins: `(Σ √min(coins per person, 50))²`. The cap is set by
    `support_cap`, and the team's own members are excluded. Ten people giving 10 coins each are worth
    ten times more than one person giving 100;
  - AI judge («داوری هوش مصنوعی») — 200 points. The product's AI quality score (0–100) is always shown
    separately from the human jury.

  Until the game is closed, the public leaderboard shows only the **number of supporters**. After
  `CLOSED` it shows the total score, the three-criteria breakdown and the prizes.
- **AI tag.** Every idea card and product card shows an AI tag (عالی / خوب / نیاز به کار) with a short
  reason. It is guidance only.
- **Bazaar Studio go-live (optional).** A team can ask the organiser to publish its product. Live
  products get a «🚀 لایو» badge and are candidates for the best-live-product prize.
- **Live auction (market day).** Teams send their product's special edition to the auction queue,
  up to 20 minutes before the market closes. Auctions run one at a time in queue order and the
  scheduler starts them automatically. Winning an auction counts as a purchase.
- **Anti-cheat.** Players see a single statement (`ANTI_CHEAT_STATEMENT` in `src/lib/rules.ts`): the AI
  reviews transactions and project content, and collusion, fake accounts and copying are deducted from
  the score. The organiser makes the final call and sets the penalty per team in `/admin/teams`.

## Local development

```bash
npm install
cp .env.example .env     # fill in SESSION_SECRET, ADMIN_PASSWORD, ANTHROPIC_API_KEY, ...
npm run db:migrate       # prisma migrate deploy
npm run db:seed          # organiser account + initial phase
npm run db:seed-test     # optional: test users on the arena.test domain
npm run dev              # http://localhost:3000
```

- In development the coin shop uses the **fake payment gateway** (`PAYMENT_DRIVER` defaults to `fake`
  outside production), so you can buy coins without real money. Production defaults to `manual`: the
  organiser confirms orders in `/admin/coins`. See `docs/ops.md` §9 for all payment settings and for
  how to add a real gateway.
- Without `ANTHROPIC_API_KEY` the AI features (idea analyst, AI judge, assistant) return nothing, and
  the UI keeps working without them.
- Change the phase from the organiser panel (`/admin`). For quick local testing you can also run
  `npx tsx scripts/set-phase.ts <PHASE>`. This script writes the phase directly, so it sends no
  notifications and does not run settlement on `CLOSED`.

## Checks

```bash
npm run typecheck   # tsc --noEmit
npm run lint
npm test            # vitest (scoring engine and other pure modules)
npm run smoke       # smoke scripts, each on its own temporary database
npm run e2e         # playwright
```

## Documentation

- `CONTRACTS.md`: shared conventions and the `src/lib` module APIs (Persian).
- `docs/runbook-event-day.md`: event-day checklist and the organiser's tasks in each phase.
- `docs/ops.md`: backups, restore, staging, monitoring, HTTPS, environment variables, payments.
- `deploy/README-deploy.md`: server setup and deployment.
- `docs/a11y.md`, `docs/loadtest.md`: accessibility review and load-test notes.

Every change is committed and pushed to both remotes, `origin` (GitHub) and `tapsell` (GitLab).
See `AGENTS.md`.
