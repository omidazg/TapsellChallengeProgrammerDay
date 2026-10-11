import { peopleSupport } from "@/lib/economy/engine";
import { fa } from "@/lib/persian";

/**
 * مثال حساب درجه‌دوی «حمایت مردمی» با همان موتور امتیاز و سقف مؤثر (support_cap):
 * ۱۰ حامیِ ۱۰ سکه‌ای در برابر یک حامیِ ۱۰۰ سکه‌ای. عدد از خود peopleSupport درمی‌آید تا با هر سقفی درست بماند
 * (سقف ۵۰: ۱۰۰۰ در برابر ۵۰ یعنی ۲۰ برابر؛ سقف ۱۰۰ یا بیشتر: ۱۰ برابر).
 * در راهنما، صفحهٔ اصلی و صفحه‌های حمایت استفاده می‌شود.
 */
export function peopleExample(cap: number): string {
  const many = peopleSupport(Array.from({ length: 10 }, (_, i) => ({ userId: `s${i}`, amount: 10 })), cap).score;
  const one = peopleSupport([{ userId: "big", amount: 100 }], cap).score;
  if (one <= 0) return "۱۰ نفر که هر کدام ۱۰ سکه بدهند، خیلی بیشتر از یک نفر با ۱۰۰ سکه می‌ارزند.";
  const ratio = Math.round((many / one) * 10) / 10;
  return `۱۰ نفر که هر کدام ۱۰ سکه بدهند، ${fa(ratio).replace(".", "٫")} برابرِ یک نفر با ۱۰۰ سکه می‌ارزند.`;
}
