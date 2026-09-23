import Anthropic from "@anthropic-ai/sdk";
import { checkDailyBudget, recordUsage } from "./ai-budget";

/**
 * دسترسی به Claude. اگر کلید نباشد، null برمی‌گرداند و قابلیت‌ها به‌صورت
 * محترمانه غیرفعال می‌شوند (بازی بدون هوش مصنوعی هم ادامه می‌یابد).
 */
let testClient: Anthropic | null | undefined;

/** فقط برای تست‌ها: کلاینت جعلی (یا null برای غیرفعال‌سازی) به‌جای کلاینت واقعی تزریق می‌شود. هرگز API واقعی صدا زده نمی‌شود. */
export function setTestClient(client: Anthropic | null | undefined): void {
  testClient = client;
}

export function aiClient(): Anthropic | null {
  if (testClient !== undefined) return testClient;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  // ANTHROPIC_BASE_URL اختیاری است: برای هدایت به یک گیت‌وی سازگار (مثل متیس) به‌جای api.anthropic.com مستقیم.
  const baseURL = process.env.ANTHROPIC_BASE_URL || undefined;
  return new Anthropic({ apiKey: key, baseURL });
}

export const AI_MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5";

export const FA_SYSTEM = "همیشه فقط به زبان فارسی پاسخ بده. لحن دوستانه، کوتاه و دقیق. از اصطلاحات فنی انگلیسی فقط وقتی استفاده کن که معادل فارسی رایج ندارند.";

// حداقل طول قابل‌کش برای پرامپت سیستمی (طبق راهنمای قیمت‌گذاری/کش Claude)؛ کوتاه‌تر از این هرگز کش نمی‌شود.
const MIN_CACHEABLE_CHARS = 2000;

/** فقط وقتی سیستم پرامپت طولانی و ثابت است cache_control اضافه می‌شود؛ پرامپت‌های کوتاه فایده‌ای از کش نمی‌برند. */
function systemBlocks(system: string): Anthropic.TextBlockParam[] {
  const full = `${FA_SYSTEM}\n\n${system}`;
  const block: Anthropic.TextBlockParam = { type: "text", text: full };
  if (full.length >= MIN_CACHEABLE_CHARS) block.cache_control = { type: "ephemeral" };
  return [block];
}

/** پیش از هر فراخوانی واقعی API، سقف بودجهٔ روزانه را بررسی می‌کند؛ در صورت عبور، هیچ درخواستی ارسال نمی‌شود. */
async function withinBudget(): Promise<boolean> {
  try {
    const status = await checkDailyBudget();
    return status.ok;
  } catch (e) {
    console.error("ai-budget check error", e);
    return true; // خطای بررسی بودجه نباید کل قابلیت هوش مصنوعی را غیرفعال کند
  }
}

async function trackUsage(usage: Anthropic.Usage): Promise<void> {
  try {
    await recordUsage(AI_MODEL, usage);
  } catch (e) {
    console.error("ai-budget record error", e);
  }
}

/** فراخوانی سادهٔ متنی؛ در نبود کلید، عبور از بودجه یا خطا، null */
export async function askText(system: string, user: string, maxTokens = 1024): Promise<string | null> {
  const client = aiClient();
  if (!client) return null;
  if (!(await withinBudget())) return null;
  try {
    const res = await client.messages.create({
      model: AI_MODEL,
      max_tokens: maxTokens,
      system: systemBlocks(system),
      messages: [{ role: "user", content: user }],
    });
    await trackUsage(res.usage);
    if (res.stop_reason === "refusal") return null;
    const text = res.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n").trim();
    return text || null;
  } catch (e) {
    console.error("AI error", e);
    return null;
  }
}

/** گفت‌وگوی چندنوبتی (برای دستیار سؤال‌وجواب)؛ در نبود کلید یا خطا، null */
export async function askChat(system: string, messages: { role: "user" | "assistant"; content: string }[], maxTokens = 512): Promise<string | null> {
  const client = aiClient();
  if (!client) return null;
  // این مسیر عمومی‌ترین مصرف‌کنندهٔ هوش مصنوعی است (دستیار قوانین)، پس مثل بقیه
  // باید پشت سقف بودجهٔ روزانه باشد و مصرفش ثبت شود.
  if (!(await withinBudget())) return null;
  try {
    const res = await client.messages.create({
      model: AI_MODEL,
      max_tokens: maxTokens,
      // سیستم‌پرامپت دستیار طولانی و ثابت است؛ systemBlocks روی آن cache_control
      // می‌گذارد و هزینهٔ توکن‌های ورودی تکراری را چند برابر کم می‌کند.
      system: systemBlocks(system),
      messages,
    });
    await trackUsage(res.usage);
    if (res.stop_reason === "refusal") return null;
    const text = res.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n").trim();
    return text || null;
  } catch (e) {
    console.error("AI chat error", e);
    return null;
  }
}

/** فراخوانی با خروجی JSON ساخت‌یافته؛ schema به شکل JSON Schema */
export async function askJson<T>(system: string, user: string, schema: Record<string, unknown>, maxTokens = 1024): Promise<T | null> {
  const client = aiClient();
  if (!client) return null;
  if (!(await withinBudget())) return null;
  try {
    const params = {
      model: AI_MODEL,
      max_tokens: maxTokens,
      system: systemBlocks(system),
      messages: [{ role: "user", content: user }],
      output_config: { format: { type: "json_schema", schema } },
    } as unknown as Anthropic.MessageCreateParamsNonStreaming;
    const res: Anthropic.Message = await client.messages.create(params);
    await trackUsage(res.usage);
    if (res.stop_reason === "refusal") return null;
    const text = res.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("");
    return JSON.parse(text) as T;
  } catch (e) {
    console.error("AI json error", e);
    return null;
  }
}
