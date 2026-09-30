import { describe, expect, it } from "vitest";
import { pickFirstPriceWinner, pickSecondPriceWinner, rankBids, type BidCandidate } from "./bids";

function bid(bidderId: string, amount: number, createdAt: number): BidCandidate {
  return { bidderId, amount, createdAt };
}

function balances(map: Record<string, number>) {
  return (id: string) => (id in map ? map[id] : null);
}

describe("rankBids", () => {
  it("sorts by amount desc, earlier first on ties, keeping only each bidder's top bid", () => {
    const ranked = rankBids([bid("a", 10, 1), bid("b", 20, 3), bid("a", 25, 4), bid("c", 20, 2)]);
    expect(ranked.map((b) => `${b.bidderId}:${b.amount}`)).toEqual(["a:25", "c:20", "b:20"]);
  });

  it("does not mutate the input", () => {
    const input = [bid("a", 1, 1), bid("b", 2, 2)];
    rankBids(input);
    expect(input.map((b) => b.bidderId)).toEqual(["a", "b"]);
  });
});

describe("pickFirstPriceWinner", () => {
  it("top bidder who can cover wins and pays exactly their bid", () => {
    const w = pickFirstPriceWinner([bid("a", 30, 1), bid("b", 40, 2)], balances({ a: 100, b: 100 }));
    expect(w?.bid.bidderId).toBe("b");
    expect(w?.price).toBe(40);
  });

  it("skips a leader who can no longer cover; next valid bidder pays their own full bid", () => {
    const w = pickFirstPriceWinner([bid("a", 30, 1), bid("b", 40, 2)], balances({ a: 100, b: 35 }));
    expect(w?.bid.bidderId).toBe("a");
    expect(w?.price).toBe(30);
  });

  it("never charges less than the bid", () => {
    const w = pickFirstPriceWinner([bid("a", 50, 1)], balances({ a: 49 }));
    expect(w).toBeNull();
  });

  it("skips bidders who no longer exist", () => {
    const w = pickFirstPriceWinner([bid("gone", 90, 1), bid("a", 20, 2)], balances({ a: 20 }));
    expect(w?.bid.bidderId).toBe("a");
    expect(w?.price).toBe(20);
  });

  it("considers only each user's highest bid (a lower own bid does not rescue an unbacked one)", () => {
    const w = pickFirstPriceWinner(
      [bid("a", 20, 1), bid("a", 60, 3), bid("b", 30, 2)],
      balances({ a: 25, b: 100 })
    );
    expect(w?.bid.bidderId).toBe("b");
    expect(w?.price).toBe(30);
  });

  it("returns null without bids", () => {
    expect(pickFirstPriceWinner([], balances({}))).toBeNull();
  });
});

describe("pickSecondPriceWinner", () => {
  it("winner pays the second price", () => {
    const w = pickSecondPriceWinner([bid("A", 30, 1), bid("B", 20, 2)], balances({ A: 100, B: 100 }));
    expect(w?.bid.bidderId).toBe("A");
    expect(w?.price).toBe(20);
  });

  it("single bid pays a token coin", () => {
    const w = pickSecondPriceWinner([bid("A", 15, 1)], balances({ A: 100 }));
    expect(w?.price).toBe(1);
  });

  it("skips a winner whose balance is below the price and recomputes the second price", () => {
    const w = pickSecondPriceWinner(
      [bid("A", 30, 1), bid("B", 20, 2), bid("C", 10, 3)],
      balances({ A: 15, B: 100, C: 100 })
    );
    expect(w?.bid.bidderId).toBe("B");
    expect(w?.price).toBe(10);
  });

  it("never charges less than the rule price", () => {
    const w = pickSecondPriceWinner([bid("A", 30, 1), bid("B", 20, 2)], balances({ A: 19, B: 0 }));
    expect(w).toBeNull();
  });

  it("an earlier tie wins and pays the tied amount", () => {
    const w = pickSecondPriceWinner([bid("B", 20, 2), bid("A", 20, 1)], balances({ A: 100, B: 100 }));
    expect(w?.bid.bidderId).toBe("A");
    expect(w?.price).toBe(20);
  });
});
