import { describe, expect, it, vi } from "vitest";

// settings-schema از ./admin ایمپورت می‌کند؛ این تست پایگاه‌داده لازم ندارد.
vi.mock("./db", () => ({ prisma: {} }));

import {
  LOCKED_AFTER_START_KEYS,
  isLockedSettingKey,
  lockedSettingChanges,
  withoutLockedKeys,
} from "./settings-lock";
import { SCHEDULER_SETTING_KEYS, SETTING_KEYS } from "./admin";
import { gameSettingsSchema, schedulerSettingsSchema } from "./settings-schema";

// مقادیر فعلی دیتابیس (ستون Setting.value همیشه رشته است)
const before = {
  starting_coins: "200",
  support_cap: "50",
  max_bought_coins_per_user: "1000",
  bid_increment: "2",
  adslot_price_banner: "60",
  adslot_price_featured: "40",
  adslot_price_push: "80",
  adslot_max_per_team: "2",
  auction_duration_sec: "300",
  market_starts_at: "",
};

// خروجی parseGameSettings (اعداد) با همان مقادیر
const unchanged = {
  starting_coins: 200,
  support_cap: 50,
  max_bought_coins_per_user: 1000,
  bid_increment: 2,
  adslot_price_banner: 60,
  adslot_price_featured: 40,
  adslot_price_push: 80,
  adslot_max_per_team: 2,
  auction_duration_sec: 300,
  market_starts_at: "",
};

describe("LOCKED_AFTER_START_KEYS", () => {
  it("covers only economy keys and every one is a real game setting", () => {
    expect([...LOCKED_AFTER_START_KEYS].sort()).toEqual(
      [
        "starting_coins",
        "support_cap",
        "max_bought_coins_per_user",
        "bid_increment",
        "adslot_price_banner",
        "adslot_price_featured",
        "adslot_price_push",
        "adslot_max_per_team",
      ].sort()
    );
    for (const key of LOCKED_AFTER_START_KEYS) expect(Object.keys(gameSettingsSchema.shape)).toContain(key);
  });

  it("keeps operational keys editable", () => {
    expect(isLockedSettingKey("market_starts_at")).toBe(false);
    expect(isLockedSettingKey("auction_duration_sec")).toBe(false);
    expect(isLockedSettingKey("auto_auction")).toBe(false);
    expect(isLockedSettingKey("adslot_hours")).toBe(false);
    expect(isLockedSettingKey("starting_coins")).toBe(true);
    expect(isLockedSettingKey("support_cap")).toBe(true);
  });

  it("legacy keys are no longer known", () => {
    for (const legacy of [
      "seed_wallet",
      "buy_wallet",
      "max_per_target",
      "penalty_per_coin",
      "solo_boost_pct",
      "duo_boost_pct",
      "auto_advance",
      "phase_hours_MARKET",
    ]) {
      expect(isLockedSettingKey(legacy)).toBe(false);
      expect(Object.keys(gameSettingsSchema.shape)).not.toContain(legacy);
      expect(Object.keys(schedulerSettingsSchema.shape)).not.toContain(legacy);
    }
  });

  it("فرم تنظیمات و اسکیمای اعتبارسنجی همان کلیدها را دارند", () => {
    expect(Object.keys(gameSettingsSchema.shape).sort()).toEqual([...SETTING_KEYS].sort());
    expect(Object.keys(schedulerSettingsSchema.shape).sort()).toEqual([...SCHEDULER_SETTING_KEYS].sort());
  });
});

describe("lockedSettingChanges", () => {
  it("allows any change while not locked (no coin spent yet)", () => {
    const after = { ...unchanged, starting_coins: 5000, support_cap: 10 };
    expect(lockedSettingChanges(false, before, after)).toEqual([]);
  });

  it("reports every changed economy key once locked (in LOCKED_AFTER_START_KEYS order)", () => {
    const after = { ...unchanged, bid_increment: 25, starting_coins: 5000 };
    expect(lockedSettingChanges(true, before, after)).toEqual(["starting_coins", "bid_increment"]);
  });

  it("accepts re-submission of the current values (the form submits all fields)", () => {
    expect(lockedSettingChanges(true, before, unchanged)).toEqual([]);
    // رشته‌های معادل عددی هم تغییر حساب نمی‌شوند
    expect(lockedSettingChanges(true, { ...before, support_cap: "50.0" }, unchanged)).toEqual([]);
    expect(lockedSettingChanges(true, before, { ...unchanged, starting_coins: " 200 " })).toEqual([]);
  });

  it("ignores changes to operational keys while locked", () => {
    const after = { ...unchanged, auction_duration_sec: 120, market_starts_at: "2026-10-01T10:00" };
    expect(lockedSettingChanges(true, before, after)).toEqual([]);
  });

  it("treats locked keys missing from the submission as unchanged", () => {
    const after = { auction_duration_sec: 90, market_starts_at: "" };
    expect(lockedSettingChanges(true, before, after)).toEqual([]);
  });

  it("flags a change when the stored value is missing", () => {
    const { starting_coins: _omit, ...partialBefore } = before;
    void _omit;
    expect(lockedSettingChanges(true, partialBefore, unchanged)).toEqual(["starting_coins"]);
  });

  it("detects small numeric changes", () => {
    expect(lockedSettingChanges(true, before, { ...unchanged, support_cap: 51 })).toEqual(["support_cap"]);
    expect(lockedSettingChanges(true, before, { ...unchanged, adslot_max_per_team: 3, adslot_price_push: 81 })).toEqual([
      "adslot_price_push",
      "adslot_max_per_team",
    ]);
  });
});

describe("withoutLockedKeys", () => {
  it("keeps everything while not locked", () => {
    expect(withoutLockedKeys(false, unchanged)).toEqual(unchanged);
  });

  it("drops economy keys once locked, keeping operational ones", () => {
    expect(withoutLockedKeys(true, unchanged)).toEqual({ auction_duration_sec: 300, market_starts_at: "" });
  });
});
