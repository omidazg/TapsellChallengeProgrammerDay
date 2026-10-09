import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { AiTag } from "@/components/AiTag";
import { fa, coins } from "@/lib/persian";
import { type FloorFilter, type IdeaCardData } from "@/lib/idea";
import { Cover } from "@/app/idea/Cover";
import { thumbUrl } from "@/lib/thumb";

const FILTERS: { key: FloorFilter; label: string }[] = [
  { key: "all", label: "همه" },
  { key: "lowest", label: "کم‌حمایت‌ترین" },
  { key: "topAnalyst", label: "بهترین ارزیابی هوش مصنوعی" },
];

export function InvestFloor({
  ideas,
  ownTeamId,
  interactive,
  filter,
  aiOff = false,
}: {
  ideas: IdeaCardData[];
  ownTeamId: string | null;
  interactive: boolean;
  filter: FloorFilter;
  aiOff?: boolean;
}) {
  // بدون هوش مصنوعی، ارزیابی تحلیل‌گر وجود ندارد؛ این گزینهٔ مرتب‌سازی پنهان می‌شود.
  const visibleFilters = aiOff ? FILTERS.filter((f) => f.key !== "topAnalyst") : FILTERS;
  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-6">
        {visibleFilters.map((f) => (
          <Link
            key={f.key}
            href={f.key === "all" ? "/invest" : `/invest?filter=${f.key}`}
            aria-current={filter === f.key ? "page" : undefined}
            className={`chip transition ${filter === f.key ? "bg-brand-navy text-white" : "chip-navy hover:bg-brand-mist"}`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {ideas.length === 0 ? (
        <div className="card p-10 text-center">
          <div className="text-5xl mb-3" aria-hidden>💡</div>
          <h3 className="text-xl font-black">هنوز ایده‌ای ثبت نشده</h3>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 stagger">
          {ideas.map((idea) => {
            const isOwn = ownTeamId !== null && idea.teamId === ownTeamId;
            return (
              <Link
                key={idea.id}
                href={`/invest/${idea.id}`}
                className="card overflow-hidden hover:-translate-y-0.5 hover:shadow-lift transition flex flex-col"
              >
                <div className="relative w-full aspect-[8/5] bg-brand-sky">
                  <Cover src={thumbUrl(idea.coverUrl)} alt={idea.title} sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 400px" />
                  {isOwn && <span className="absolute top-3 right-3 chip bg-white/90 text-brand-red">تیم خودت</span>}
                </div>
                <div className="p-4 flex flex-col gap-3 flex-1">
                  <div className="flex items-center gap-2">
                    <Avatar seed={idea.teamLogoSeed || idea.teamId} size={24} />
                    <span className="text-xs font-bold text-brand-slate truncate">{idea.teamName}</span>
                  </div>
                  <h3 className="font-black text-brand-navy leading-6 break-words">{idea.title}</h3>
                  <p className="text-sm text-brand-slate line-clamp-2 flex-1 break-words">{idea.oneLiner}</p>

                  <div className="flex flex-wrap gap-2">
                    <AiTag tag={idea.aiTag} compact />
                    <span className="chip-navy">{fa(idea.investorCount)} حامی</span>
                    <span className="chip-gold">{coins(idea.raised)}</span>
                  </div>

                  <span className={isOwn ? "btn-ghost mt-1 pointer-events-none" : "btn-primary mt-1 pointer-events-none"}>
                    {isOwn ? "ایدهٔ خودت" : interactive ? "حمایت" : "مشاهده"}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
