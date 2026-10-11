/**
 * متن زمینهٔ دستیار هوش مصنوعی مثال درجه‌دوی «حمایت مردمی» را با سقف مؤثر (support_cap) می‌گوید،
 * نه ادعای ثابت و نادرست «۱۰ برابر» (با سقف پیش‌فرض ۵۰: ۱۰۰۰ در برابر ۵۰ یعنی ۲۰ برابر).
 */
import { describe, expect, it } from "vitest";
import { buildAssistantContext } from "../src/lib/assistant-context";
import { DEFAULTS } from "../src/lib/constants";
import { peopleExample } from "../src/lib/people-example";
import { peopleSupport } from "../src/lib/economy/engine";

describe("assistant-context: مثال حمایت مردمی", () => {
  it("با سقف پیش‌فرض ۵۰، نسبت ۲۰ برابر گفته می‌شود", () => {
    expect(DEFAULTS.supportCap).toBe(50);
    const ctx = buildAssistantContext();
    expect(ctx).toContain(peopleExample(50));
    expect(ctx).toContain("۲۰ برابرِ");
    expect(ctx).not.toContain("۱۰ برابرِ یک نفر");
  });

  it("با سقف ۱۰۰ یا بیشتر همان ۱۰ برابر است و عدد از موتور امتیاز می‌آید", () => {
    const ctx = buildAssistantContext({ ...DEFAULTS, supportCap: 100 });
    expect(ctx).toContain("۱۰ برابرِ یک نفر");
    const many = peopleSupport(Array.from({ length: 10 }, (_, i) => ({ userId: `u${i}`, amount: 10 })), 50).score;
    const one = peopleSupport([{ userId: "big", amount: 100 }], 50).score;
    expect(many / one).toBeCloseTo(20, 9);
  });
});
