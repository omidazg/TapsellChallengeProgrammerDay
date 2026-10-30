import Link from "next/link";

type TrackLink = { id: string; name: string; status?: string };

/**
 * انتخاب محور با پارامتر نشانی. `allLabel` برای صفحه‌هایی است که نمای «همهٔ محورها» هم دارند (فیلتر).
 * `hrefFor(null)` یعنی بدون فیلتر محور.
 */
export function TrackSwitcher({
  tracks,
  current,
  hrefFor,
  allLabel,
}: {
  tracks: TrackLink[];
  current: string | null;
  hrefFor: (trackId: string | null) => string;
  allLabel?: string;
}) {
  // یک محور بدون نمای «همه» انتخابی ندارد
  if (tracks.length === 0 || (tracks.length === 1 && !allLabel)) return null;
  const cls = (active: boolean) => (active ? "chip bg-brand-navy text-white" : "chip-navy hover:bg-brand-mist");
  return (
    <nav aria-label="انتخاب محور" className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-bold text-brand-slate">محور:</span>
      {allLabel && (
        <Link href={hrefFor(null)} aria-current={current === null ? "page" : undefined} className={cls(current === null)}>
          {allLabel}
        </Link>
      )}
      {tracks.map((t) => (
        <Link key={t.id} href={hrefFor(t.id)} aria-current={current === t.id ? "page" : undefined} className={cls(current === t.id)}>
          {t.name}
          {t.status && t.status !== "open" && <span className="opacity-70"> (بسته)</span>}
        </Link>
      ))}
    </nav>
  );
}
