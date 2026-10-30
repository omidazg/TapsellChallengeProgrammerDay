import Link from "next/link";
import { ENTRY_CATEGORY_LABEL, type EntryCategory, type TrackInfo } from "@/lib/track-data";

export type BoardView = {
  /** null = نمای کلی همهٔ محورها */
  track: TrackInfo | null;
  /** فقط در محور MIXED؛ "" = همهٔ محور */
  category: EntryCategory | "";
};

/** محور و دستهٔ انتخاب‌شده از نشانی؛ مقدار نامعتبر یا محور مخفی به نمای کلی برمی‌گردد. */
export function resolveBoardView(params: { track?: string; cat?: string }, tracks: TrackInfo[]): BoardView {
  const track = tracks.find((t) => t.id === params.track) ?? null;
  const category = track?.category === "MIXED" && (params.cat === "TECH" || params.cat === "NON_TECH") ? params.cat : "";
  return { track, category };
}

function Tab({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} aria-current={active ? "page" : undefined} className={`${active ? "chip-red" : "chip-navy"} !text-sm !px-3.5 !py-1.5`}>
      {children}
    </Link>
  );
}

/** جابه‌جایی بین نمای کلی و جدول هر محور با ?track= و بین دسته‌های فنی و غیرفنی با ?cat= */
export function BoardTabs({ basePath, tracks, view }: { basePath: string; tracks: TrackInfo[]; view: BoardView }) {
  const { track, category } = view;
  return (
    <div className="space-y-2">
      <nav className="flex flex-wrap gap-2" aria-label="انتخاب محور">
        <Tab href={basePath} active={!track}>
          نمای کلی
        </Tab>
        {tracks.map((t) => (
          <Tab key={t.id} href={`${basePath}?track=${t.id}`} active={track?.id === t.id}>
            {t.name}
          </Tab>
        ))}
      </nav>
      {track?.category === "MIXED" && (
        <nav className="flex flex-wrap gap-2" aria-label="انتخاب دسته">
          <Tab href={`${basePath}?track=${track.id}`} active={!category}>
            همهٔ محور
          </Tab>
          {(Object.keys(ENTRY_CATEGORY_LABEL) as EntryCategory[]).map((c) => (
            <Tab key={c} href={`${basePath}?track=${track.id}&cat=${c}`} active={category === c}>
              {ENTRY_CATEGORY_LABEL[c]}
            </Tab>
          ))}
        </nav>
      )}
    </div>
  );
}
