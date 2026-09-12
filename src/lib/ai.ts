import Anthropic from "@anthropic-ai/sdk";

/**
 * دسترسی به Claude. اگر کلید نباشد، null برمی‌گرداند و قابلیت‌ها به‌صورت
 * محترمانه غیرفعال می‌شوند (بازی بدون هوش مصنوعی هم ادامه می‌یابد).
 */
export function aiClient(): Anthropic | null {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  return new Anthropic({ apiKey: key });
}

export const AI_MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5";

export const FA_SYSTEM = "همیشه فقط به زبان فارسی پاسخ بده. لحن دوستانه، کوتاه و دقیق. از اصطلاحات فنی انگلیسی فقط وقتی استفاده کن که معادل فارسی رایج ندارند.";

/** فراخوانی سادهٔ متنی؛ در نبود کلید یا خطا، null */
export async function askText(system: string, user: string, maxTokens = 1024): Promise<string | null> {
  const client = aiClient();
  if (!client) return null;
  try {
    const res = await client.messages.create({
      model: AI_MODEL,
      max_tokens: maxTokens,
      system: `${FA_SYSTEM}\n\n${system}`,
      messages: [{ role: "user", content: user }],
    });
    if (res.stop_reason === "refusal") return null;
    const text = res.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n").trim();
    return text || null;
  } catch (e) {
    console.error("AI error", e);
    return null;
  }
}

/** فراخوانی با خروجی JSON ساخت‌یافته؛ schema به شکل JSON Schema */
export async function askJson<T>(system: string, user: string, schema: Record<string, unknown>, maxTokens = 1024): Promise<T | null> {
  const client = aiClient();
  if (!client) return null;
  try {
    const res = await client.messages.create({
      model: AI_MODEL,
      max_tokens: maxTokens,
      system: `${FA_SYSTEM}\n\n${system}`,
      messages: [{ role: "user", content: user }],
      output_config: { format: { type: "json_schema", schema } },
    } as Parameters<typeof client.messages.create>[0]);
    if (res.stop_reason === "refusal") return null;
    const text = res.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("");
    return JSON.parse(text) as T;
  } catch (e) {
    console.error("AI json error", e);
    return null;
  }
}
