import { describe, expect, it } from "vitest";
import {
  auctionWinnerIds,
  earlyBirdUserIds,
  earliestUserId,
  mostDistinctTeamsInvestor,
  topByCount,
  topSalesTeamIds,
} from "./badges";

describe("topByCount", () => {
  it("returns the user(s) with the most rows", () => {
    const rows = [{ userId: "a" }, { userId: "b" }, { userId: "a" }, { userId: "a" }];
    expect(topByCount(rows)).toEqual([{ userId: "a", count: 3 }]);
  });

  it("returns all tied users, sorted by userId asc", () => {
    const rows = [{ userId: "b" }, { userId: "a" }, { userId: "b" }, { userId: "a" }];
    expect(topByCount(rows)).toEqual([
      { userId: "a", count: 2 },
      { userId: "b", count: 2 },
    ]);
  });

  it("returns [] on no rows", () => {
    expect(topByCount([])).toEqual([]);
  });
});

describe("earliestUserId", () => {
  it("picks the earliest createdAt", () => {
    const rows = [
      { id: "i2", userId: "u2", createdAt: new Date("2026-01-02") },
      { id: "i1", userId: "u1", createdAt: new Date("2026-01-01") },
    ];
    expect(earliestUserId(rows)).toBe("u1");
  });

  it("breaks exact-time ties by smallest id", () => {
    const t = new Date("2026-01-01T00:00:00Z");
    const rows = [
      { id: "z", userId: "uZ", createdAt: t },
      { id: "a", userId: "uA", createdAt: t },
    ];
    expect(earliestUserId(rows)).toBe("uA");
  });

  it("returns null on no rows", () => {
    expect(earliestUserId([])).toBeNull();
  });
});

describe("mostDistinctTeamsInvestor", () => {
  it("counts distinct teams per user, not total investments", () => {
    const rows = [
      { userId: "a", teamId: "t1" },
      { userId: "a", teamId: "t1" }, // دو سرمایه‌گذاری روی یک تیم = یک تیم
      { userId: "a", teamId: "t2" },
      { userId: "b", teamId: "t1" },
      { userId: "b", teamId: "t2" },
      { userId: "b", teamId: "t3" },
    ];
    expect(mostDistinctTeamsInvestor(rows)).toEqual([{ userId: "b", count: 3 }]);
  });

  it("returns [] on no investments", () => {
    expect(mostDistinctTeamsInvestor([])).toEqual([]);
  });
});

describe("earlyBirdUserIds", () => {
  it("returns only the first n by createdAt", () => {
    const users = Array.from({ length: 15 }, (_, i) => ({ id: `u${i}`, createdAt: new Date(2026, 0, i + 1) }));
    const early = earlyBirdUserIds(users, 10);
    expect(early.size).toBe(10);
    expect(early.has("u0")).toBe(true);
    expect(early.has("u9")).toBe(true);
    expect(early.has("u10")).toBe(false);
  });

  it("includes everyone when fewer than n users exist", () => {
    const users = [{ id: "u1", createdAt: new Date() }];
    expect(earlyBirdUserIds(users, 10).size).toBe(1);
  });
});

describe("auctionWinnerIds", () => {
  it("collects distinct non-null winners", () => {
    const auctions = [{ winnerId: "u1" }, { winnerId: null }, { winnerId: "u2" }, { winnerId: "u1" }];
    expect(auctionWinnerIds(auctions)).toEqual(new Set(["u1", "u2"]));
  });
});

describe("topSalesTeamIds", () => {
  it("picks the team(s) with the highest total purchase amount", () => {
    const rows = [
      { teamId: "t1", amount: 30 },
      { teamId: "t1", amount: 20 },
      { teamId: "t2", amount: 40 },
    ];
    expect(topSalesTeamIds(rows)).toEqual(new Set(["t1"]));
  });

  it("returns an empty set when there are no sales", () => {
    expect(topSalesTeamIds([]).size).toBe(0);
  });

  it("allows ties across teams", () => {
    const rows = [
      { teamId: "t1", amount: 50 },
      { teamId: "t2", amount: 50 },
    ];
    expect(topSalesTeamIds(rows)).toEqual(new Set(["t1", "t2"]));
  });
});
