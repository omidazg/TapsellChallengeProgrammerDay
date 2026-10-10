import { describe, expect, it } from "vitest";
import { coverSeed, coverSvg, generatedCoverUrl, isGeneratedCoverUrl, randomCoverUrl, seedFromCoverName } from "./cover-art";
import { coverUrl, imageUrlError } from "./product-utils";

describe("cover-art", () => {
  it("هر seed همیشه همان SVG را می‌دهد و seedهای متفاوت تصویر متفاوت", () => {
    expect(coverSvg("team-a")).toBe(coverSvg("team-a"));
    expect(coverSvg("team-a")).not.toBe(coverSvg("team-b"));
    expect(coverSvg("x")).toMatch(/^<svg [^>]*viewBox="0 0 800 500"/);
  });

  it("seed دلخواه (فارسی، فاصله) به نشانی امن تبدیل می‌شود", () => {
    expect(coverSeed("Team A!")).toBe("team-a");
    expect(coverSeed("تیم الف")).toMatch(/^c[a-z0-9]+$/);
    expect(isGeneratedCoverUrl(generatedCoverUrl("تیم الف"))).toBe(true);
    expect(isGeneratedCoverUrl(randomCoverUrl())).toBe(true);
  });

  it("نام فایل نامعتبر رد می‌شود", () => {
    expect(seedFromCoverName("abc.svg")).toBe("abc");
    expect(seedFromCoverName("../x.svg")).toBeNull();
    expect(seedFromCoverName("abc.png")).toBeNull();
    expect(isGeneratedCoverUrl("/covers/a/b.svg")).toBe(false);
  });

  it("جلد پیش‌فرض محصول دیگر به picsum وابسته نیست و اعتبارسنجی آن را می‌پذیرد", () => {
    expect(coverUrl([], "team-a")).toBe("/covers/team-a.svg");
    expect(imageUrlError(randomCoverUrl())).toBeNull();
    expect(imageUrlError("/covers/../../etc.svg")).not.toBeNull();
  });
});
