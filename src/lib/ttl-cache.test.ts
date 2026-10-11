import { afterEach, describe, expect, it, vi } from "vitest";
import { cached, cacheSize, invalidate, MAX_ENTRIES } from "./ttl-cache";

afterEach(() => {
  invalidate();
  vi.useRealTimers();
});

describe("ttl-cache", () => {
  it("shares one loader call between concurrent callers", async () => {
    const loader = vi.fn(async () => 42);
    const [a, b] = await Promise.all([cached("k", 1000, loader), cached("k", 1000, loader)]);
    expect(a).toBe(42);
    expect(b).toBe(42);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("drops expired entries instead of keeping them forever", async () => {
    // the sweep throttle remembers the last real-clock sweep, so start in the future
    const t0 = Date.now() + 3_600_000;
    vi.useFakeTimers();
    vi.setSystemTime(t0);
    for (let i = 0; i < 100; i++) await cached(`old:${i}`, 1000, async () => i);
    expect(cacheSize()).toBe(100);

    // past the TTL and the sweep throttle: the next write clears every expired key
    vi.setSystemTime(t0 + 60_000);
    await cached("fresh", 1000, async () => 1);
    expect(cacheSize()).toBe(1);
  });

  it("never grows past MAX_ENTRIES (oldest evicted first)", async () => {
    for (let i = 0; i < MAX_ENTRIES + 50; i++) void cached(`live:${i}`, 60_000, async () => i);
    expect(cacheSize()).toBe(MAX_ENTRIES);

    const loader = vi.fn(async () => -1);
    await cached("live:0", 60_000, loader); // evicted -> reloaded
    expect(loader).toHaveBeenCalledTimes(1);
    const kept = vi.fn(async () => -1);
    await cached(`live:${MAX_ENTRIES + 49}`, 60_000, kept); // newest -> still cached
    expect(kept).not.toHaveBeenCalled();
  });

  it("does not cache failures", async () => {
    await expect(cached("err", 1000, async () => Promise.reject(new Error("x")))).rejects.toThrow("x");
    await Promise.resolve();
    expect(await cached("err", 1000, async () => "ok")).toBe("ok");
  });
});
