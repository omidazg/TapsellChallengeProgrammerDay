import type { AiTagInfo } from "@/lib/ai-tag";
import { fa } from "@/lib/persian";

const TONE = { great: "chip-ok", good: "chip-cyan", work: "chip-gold" } as const;

/**
 * برچسب هوش مصنوعی روی کارت ایده/محصول. compact: فقط برچسب (برای کارت‌های فهرست)؛
 * در غیر این صورت خلاصهٔ دلیل هم زیرش می‌آید.
 */
export function AiTag({ tag, compact = false }: { tag: AiTagInfo | null; compact?: boolean }) {
  if (!tag) return null;
  const chip = (
    <span className={TONE[tag.level]} title={tag.summary || undefined}>
      <span aria-hidden>🤖</span> {tag.label}
      <span className="sr-only"> — ارزیابی هوش مصنوعی، نمرهٔ {fa(tag.score)} از ۱۰۰</span>
    </span>
  );
  if (compact || !tag.summary) return chip;
  return (
    <div className="space-y-1">
      {chip}
      <p className="text-xs text-brand-slate leading-6">{tag.summary}</p>
    </div>
  );
}
