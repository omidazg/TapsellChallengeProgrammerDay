import { describe, expect, it, vi } from "vitest";

// ./admin برای SETTING_KEYS ایمپورت می‌شود ولی پایگاه‌داده لازم نیست؛ پس اتصال Prisma ساخته نمی‌شود.
vi.mock("./db", () => ({ prisma: {} }));

import { DEFAULTS } from "./constants";
import { GAME_VALUE_SETTINGS, mergeGameValues } from "./game-values-core";
import { SETTING_KEYS } from "./admin";
import { LOCKED_AFTER_START_KEYS } from "./settings-lock";

describe("DEFAULTS (اقتصاد ساده‌شدهٔ سکه)", () => {
  it("مقادیر پیش‌فرض بازی", () => {
    expect(DEFAULTS.startingCoins).toBe(200);
    expect(DEFAULTS.supportCap).toBe(50);
    expect(DEFAULTS.maxBoughtCoinsPerUser).toBe(1000);
    expect(DEFAULTS.minCoinPurchase).toBe(10);
    expect(DEFAULTS.auctionEnqueueCutoffMin).toBe(20);
    expect(DEFAULTS.adslotMaxPerTeam).toBe(2);
  });

  it("کلیدهای اقتصاد قدیمی دیگر وجود ندارند", () => {
    for (const legacy of ["seedWallet", "buyWallet", "maxPerTarget", "penaltyPerCoin", "shieldFloor", "bargainDiscount", "soloBoostPct", "duoBoostPct"]) {
      expect(DEFAULTS).not.toHaveProperty(legacy);
    }
  });
});

describe("mergeGameValues", () => {
  it("بدون ردیف تنظیمات، همان DEFAULTS را برمی‌گرداند", () => {
    expect(mergeGameValues({})).toEqual(DEFAULTS);
  });

  it("مقادیر تنظیم‌شده را روی پیش‌فرض‌ها اعمال می‌کند و بقیه دست‌نخورده می‌مانند", () => {
    const v = mergeGameValues({
      starting_coins: "150",
      support_cap: "30",
      max_bought_coins_per_user: "500",
      bid_increment: "5",
      auction_duration_sec: "240",
      adslot_price_banner: "70",
      adslot_price_featured: "45",
      adslot_price_push: "90",
      adslot_max_per_team: "3",
    });
    expect(v).toEqual({
      ...DEFAULTS,
      startingCoins: 150,
      supportCap: 30,
      maxBoughtCoinsPerUser: 500,
      bidIncrement: 5,
      auctionDurationSec: 240,
      adslotPriceBanner: 70,
      adslotPriceFeatured: 45,
      adslotPricePush: 90,
      adslotMaxPerTeam: 3,
    });
    // ثابت‌های غیرقابل‌تنظیم
    expect(v.minCoinPurchase).toBe(DEFAULTS.minCoinPurchase);
    expect(v.maxPrice).toBe(DEFAULTS.maxPrice);
    expect(v.auctionEnqueueCutoffMin).toBe(DEFAULTS.auctionEnqueueCutoffMin);
  });

  it("کلیدهای عدد صحیح مثل getSettingInt گرد به پایین می‌شوند", () => {
    const v = mergeGameValues({ support_cap: "25.9", starting_coins: "199.99" });
    expect(v.supportCap).toBe(25);
    expect(v.startingCoins).toBe(199);
  });

  it("مقدار خالی/نامعتبر/null به پیش‌فرض برمی‌گردد و صفر معتبر است", () => {
    const v = mergeGameValues({ starting_coins: "", support_cap: "abc", max_bought_coins_per_user: null, adslot_max_per_team: "0" });
    expect(v.startingCoins).toBe(DEFAULTS.startingCoins);
    expect(v.supportCap).toBe(DEFAULTS.supportCap);
    expect(v.maxBoughtCoinsPerUser).toBe(DEFAULTS.maxBoughtCoinsPerUser);
    expect(v.adslotMaxPerTeam).toBe(0);
  });

  it("کلیدهای ناشناخته یا قدیمی نادیده گرفته می‌شوند", () => {
    expect(
      mergeGameValues({
        collusion_threshold: "1",
        seed_wallet: "999",
        buy_wallet: "999",
        max_per_target: "1",
        penalty_per_coin: "3",
        shield_floor: "0.9",
        // کلیدهای حذف‌شده؛ ردیف‌های قدیمی Setting آن‌ها بی‌اثرند
        solo_boost_pct: "20",
        duo_boost_pct: "10",
      })
    ).toEqual(DEFAULTS);
  });

  it("هر کلید تنظیمات به یک فیلد واقعی DEFAULTS نگاشت می‌شود", () => {
    for (const { field } of Object.values(GAME_VALUE_SETTINGS)) expect(DEFAULTS).toHaveProperty(field);
  });

  it("همهٔ کلیدهای قفل‌شده پس از شروع و همهٔ کلیدهای عددی پنل پوشش داده شده‌اند", () => {
    const covered = Object.keys(GAME_VALUE_SETTINGS);
    for (const key of LOCKED_AFTER_START_KEYS) expect(covered).toContain(key);
    for (const key of SETTING_KEYS) if (key !== "market_starts_at") expect(covered).toContain(key);
  });
});
