import type { UserBadge } from "@/lib/badges";

/** شبکهٔ نشان‌ها: نشان‌های گرفته‌شده رنگی، بقیه خاکستری با توضیحِ راهنما */
export function BadgeGrid({ badges }: { badges: UserBadge[] }) {
  return (
    <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3" aria-label="نشان‌ها">
      {badges.map((b) => (
        <li
          key={b.id}
          className={`rounded-2xl border p-3 text-center ${b.earned ? "border-brand-cyan/40 bg-brand-ice" : "border-brand-mist bg-white opacity-60"}`}
        >
          <span className={`block text-3xl ${b.earned ? "" : "grayscale"}`} aria-hidden>
            {b.emoji}
          </span>
          <span className="mt-2 block text-xs font-black text-brand-navy">{b.title}</span>
          <span className="mt-1 block text-[11px] text-brand-slate">
            {b.earned ? "گرفته‌شده" : b.description}
          </span>
        </li>
      ))}
    </ul>
  );
}
