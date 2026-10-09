import { describe, expect, it, vi } from "vitest";

// settings-schema از ./admin ایمپورت می‌کند؛ این تست پایگاه‌داده لازم ندارد.
vi.mock("./db", () => ({ prisma: {} }));

import { PHASES } from "./phases";
import {
  LOCKED_AFTER_START_KEYS,
  areEconomySettingsLocked,
  isLockedSettingKey,
  lockedSettingChanges,
  withoutLockedKeys,
} from "./settings-lock";
import { gameSettingsSchema } from "./settings-schema";

// مقادیر فعلی دیتابیس (ستون Setting.value همیشه رشته است)
const before = {
  starting_coins: "200",
  support_cap: "50",
  solo_boost_pct: "15",
  duo_boost_pct: "7",
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
  solo_boost_pct: 15,
  duo_boost_pct: 7,
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
        "solo_boost_pct",
        "duo_boost_pct",
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
    expect(isLockedSettingKey("auto_advance")).toBe(false);
    expect(isLockedSettingKey("starting_coins")).toBe(true);
    expect(isLockedSettingKey("support_cap")).toBe(true);
  });

  it("legacy keys are no longer known", () => {
    for (const legacy of ["seed_wallet", "buy_wallet", "max_per_target", "penalty_per_coin"]) {
      expect(isLockedSettingKey(legacy)).toBe(false);
      expect(Object.keys(gameSettingsSchema.shape)).not.toContain(legacy);
    }
  });
});

describe("areEconomySettingsLocked", () => {
  it("is unlocked only during REGISTRATION", () => {
    for (const phase of PHASES) expect(areEconomySettingsLocked(phase)).toBe(phase !== "REGISTRATION");
  });
});

describe("lockedSettingChanges", () => {
  it("allows any change during REGISTRATION", () => {
    const after = { ...unchanged, starting_coins: 5000, support_cap: 10 };
    expect(lockedSettingChanges("REGISTRATION", before, after)).toEqual([]);
  });

  it("reports every changed economy key in every phase after start (in LOCKED_AFTER_START_KEYS order)", () => {
    const after = { ...unchanged, bid_increment: 25, starting_coins: 5000 };
    for (const phase of PHASES.filter((p) => p !== "REGISTRATION")) {
      expect(lockedSettingChanges(phase, before, after)).toEqual(["starting_coins", "bid_increment"]);
    }
  });

  it("accepts re-submission of the current values (the form submits all fields)", () => {
    expect(lockedSettingChanges("MARKET", before, unchanged)).toEqual([]);
    // رشته‌های معادل عددی هم تغییر حساب نمی‌شوند
    expect(lockedSettingChanges("MARKET", { ...before, support_cap: "50.0" }, unchanged)).toEqual([]);
    expect(lockedSettingChanges("MARKET", before, { ...unchanged, starting_coins: " 200 " })).toEqual([]);
  });

  it("ignores changes to operational keys while locked", () => {
    const after = { ...unchanged, auction_duration_sec: 120, market_starts_at: "2026-10-01T10:00" };
    expect(lockedSettingChanges("MARKET", before, after)).toEqual([]);
  });

  it("treats locked keys missing from the submission as unchanged", () => {
    const after = { auction_duration_sec: 90, market_starts_at: "" };
    expect(lockedSettingChanges("BUILD", before, after)).toEqual([]);
  });

  it("flags a change when the stored value is missing", () => {
    const { starting_coins: _omit, ...partialBefore } = before;
    void _omit;
    expect(lockedSettingChanges("IDEATION", partialBefore, unchanged)).toEqual(["starting_coins"]);
  });

  it("detects small numeric changes", () => {
    expect(lockedSettingChanges("CLOSED", before, { ...unchanged, duo_boost_pct: 8 })).toEqual(["duo_boost_pct"]);
    expect(lockedSettingChanges("SEED_ROUND", before, { ...unchanged, adslot_max_per_team: 3, adslot_price_push: 81 })).toEqual([
      "adslot_price_push",
      "adslot_max_per_team",
    ]);
  });
});

describe("withoutLockedKeys", () => {
  it("keeps everything during REGISTRATION", () => {
    expect(withoutLockedKeys("REGISTRATION", unchanged)).toEqual(unchanged);
  });

  it("drops economy keys after start, keeping operational ones", () => {
    expect(withoutLockedKeys("SEED_ROUND", unchanged)).toEqual({ auction_duration_sec: 300, market_starts_at: "" });
  });
});
