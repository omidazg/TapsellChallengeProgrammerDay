import { describe, expect, it } from "vitest";
import { DEFAULTS } from "./constants";
import { GAME_VALUE_SETTINGS, mergeGameValues } from "./game-values-core";
import { SETTING_KEYS } from "./admin";
import { LOCKED_AFTER_START_KEYS } from "./settings-lock";

describe("mergeGameValues", () => {
  it("بدون ردیف تنظیمات، همان DEFAULTS را برمی‌گرداند", () => {
    expect(mergeGameValues({})).toEqual(DEFAULTS);
  });

  it("مقادیر تنظیم‌شده را روی پیش‌فرض‌ها اعمال می‌کند و بقیه دست‌نخورده می‌مانند", () => {
    const v = mergeGameValues({
      seed_wallet: "150",
      buy_wallet: "80",
      max_per_target: "30",
      penalty_per_coin: "1.5",
      bid_increment: "5",
      auction_duration_sec: "240",
    });
    expect(v).toEqual({
      ...DEFAULTS,
      seedWallet: 150,
      buyWallet: 80,
      maxPerTarget: 30,
      penaltyPerCoin: 1.5,
      bidIncrement: 5,
      auctionDurationSec: 240,
    });
    // ثابت‌های غیرقابل‌تنظیم
    expect(v.shieldFloor).toBe(DEFAULTS.shieldFloor);
    expect(v.maxPrice).toBe(DEFAULTS.maxPrice);
  });

  it("کلیدهای عدد صحیح مثل getSettingInt گرد به پایین و جریمه مثل getSettingFloat اعشاری می‌ماند", () => {
    const v = mergeGameValues({ max_per_target: "25.9", penalty_per_coin: "0.5" });
    expect(v.maxPerTarget).toBe(25);
    expect(v.penaltyPerCoin).toBe(0.5);
  });

  it("مقدار خالی/نامعتبر/null به پیش‌فرض برمی‌گردد و صفر معتبر است", () => {
    const v = mergeGameValues({ seed_wallet: "", buy_wallet: "abc", max_per_target: null, penalty_per_coin: "0" });
    expect(v.seedWallet).toBe(DEFAULTS.seedWallet);
    expect(v.buyWallet).toBe(DEFAULTS.buyWallet);
    expect(v.maxPerTarget).toBe(DEFAULTS.maxPerTarget);
    expect(v.penaltyPerCoin).toBe(0);
  });

  it("کلیدهای ناشناخته نادیده گرفته می‌شوند", () => {
    expect(mergeGameValues({ collusion_threshold: "1", shield_floor: "0.9" })).toEqual(DEFAULTS);
  });

  it("همهٔ کلیدهای قفل‌شده پس از شروع و همهٔ کلیدهای عددی پنل پوشش داده شده‌اند", () => {
    const covered = Object.keys(GAME_VALUE_SETTINGS);
    for (const key of LOCKED_AFTER_START_KEYS) expect(covered).toContain(key);
    for (const key of SETTING_KEYS) if (key !== "market_starts_at") expect(covered).toContain(key);
  });
});
