import { describe, expect, it } from "vitest";
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
  seed_wallet: "1000",
  buy_wallet: "500",
  max_per_target: "300",
  penalty_per_coin: "0.5",
  bid_increment: "10",
  auction_duration_sec: "120",
  market_starts_at: "",
};

// خروجی parseGameSettings (اعداد) با همان مقادیر
const unchanged = {
  seed_wallet: 1000,
  buy_wallet: 500,
  max_per_target: 300,
  penalty_per_coin: 0.5,
  bid_increment: 10,
  auction_duration_sec: 120,
  market_starts_at: "",
};

describe("LOCKED_AFTER_START_KEYS", () => {
  it("covers only economy keys and every one is a real game setting", () => {
    expect([...LOCKED_AFTER_START_KEYS].sort()).toEqual(
      ["bid_increment", "buy_wallet", "max_per_target", "penalty_per_coin", "seed_wallet"].sort()
    );
    for (const key of LOCKED_AFTER_START_KEYS) expect(Object.keys(gameSettingsSchema.shape)).toContain(key);
  });

  it("keeps operational keys editable", () => {
    expect(isLockedSettingKey("market_starts_at")).toBe(false);
    expect(isLockedSettingKey("auction_duration_sec")).toBe(false);
    expect(isLockedSettingKey("auto_advance")).toBe(false);
    expect(isLockedSettingKey("seed_wallet")).toBe(true);
  });
});

describe("areEconomySettingsLocked", () => {
  it("is unlocked only during REGISTRATION", () => {
    for (const phase of PHASES) expect(areEconomySettingsLocked(phase)).toBe(phase !== "REGISTRATION");
  });
});

describe("lockedSettingChanges", () => {
  it("allows any change during REGISTRATION", () => {
    const after = { ...unchanged, seed_wallet: 5000, penalty_per_coin: 2 };
    expect(lockedSettingChanges("REGISTRATION", before, after)).toEqual([]);
  });

  it("reports every changed economy key in every phase after start", () => {
    const after = { ...unchanged, seed_wallet: 5000, bid_increment: 25 };
    for (const phase of PHASES.filter((p) => p !== "REGISTRATION")) {
      expect(lockedSettingChanges(phase, before, after)).toEqual(["seed_wallet", "bid_increment"]);
    }
  });

  it("accepts re-submission of the current values (the form submits all fields)", () => {
    expect(lockedSettingChanges("MARKET", before, unchanged)).toEqual([]);
    // رشته‌های معادل عددی هم تغییر حساب نمی‌شوند
    expect(lockedSettingChanges("MARKET", { ...before, penalty_per_coin: "0.50" }, unchanged)).toEqual([]);
    expect(lockedSettingChanges("MARKET", before, { ...unchanged, seed_wallet: " 1000 " })).toEqual([]);
  });

  it("ignores changes to operational keys while locked", () => {
    const after = { ...unchanged, auction_duration_sec: 300, market_starts_at: "2026-10-01T10:00" };
    expect(lockedSettingChanges("AUCTION", before, after)).toEqual([]);
  });

  it("treats locked keys missing from the submission as unchanged", () => {
    const after = { auction_duration_sec: 90, market_starts_at: "" };
    expect(lockedSettingChanges("BUILD", before, after)).toEqual([]);
  });

  it("flags a change when the stored value is missing", () => {
    const { seed_wallet: _omit, ...partialBefore } = before;
    void _omit;
    expect(lockedSettingChanges("IDEATION", partialBefore, unchanged)).toEqual(["seed_wallet"]);
  });

  it("detects small numeric changes", () => {
    expect(lockedSettingChanges("CLOSED", before, { ...unchanged, penalty_per_coin: 0.51 })).toEqual(["penalty_per_coin"]);
  });
});

describe("withoutLockedKeys", () => {
  it("keeps everything during REGISTRATION", () => {
    expect(withoutLockedKeys("REGISTRATION", unchanged)).toEqual(unchanged);
  });

  it("drops economy keys after start, keeping operational ones", () => {
    expect(withoutLockedKeys("SEED_ROUND", unchanged)).toEqual({ auction_duration_sec: 120, market_starts_at: "" });
  });
});
