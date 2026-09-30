import { prisma } from "./db";
import { GAME_VALUE_SETTINGS, mergeGameValues, type GameValues } from "./game-values-core";

export { mergeGameValues, GAME_VALUE_SETTINGS, type GameValues } from "./game-values-core";

/**
 * مقادیر مؤثر بازی برای نمایش به بازیکن (راهنما، دستیار هوش مصنوعی، صفحه‌های کیف/سرمایه‌گذاری/بازار):
 * مقدار جدول Setting اگر برگزارکننده تنظیم کرده باشد، وگرنه DEFAULTS.
 * فقط یک کوئری روی جدول Setting.
 */
export async function getEffectiveGameValues(): Promise<GameValues> {
  const rows = await prisma.setting.findMany({ where: { key: { in: Object.keys(GAME_VALUE_SETTINGS) } } });
  return mergeGameValues(Object.fromEntries(rows.map((r) => [r.key, r.value])));
}
