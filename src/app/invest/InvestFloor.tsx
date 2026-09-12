import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { fa, coins } from "@/lib/persian";
import { analystAvg, type FloorFilter, type IdeaCardData } from "@/lib/idea";
import { Cover } from "@/app/idea/Cover";

const FILTERS: { key: FloorFilter; label: string }[] = [
  { key: "all", label: "همه" },
  { key: "lowest", label: "کمتر دیده‌شده" },
  { key: "topAnalyst", label: "بالاترین رتبهٔ تحلیل‌گر" },
];

export function InvestFloor({
  ideas,
  ownTeamId,
  interactive,
  filter,
}: {
  ideas: IdeaCardData[];
  ownTeamId: string | null;
  interactive: boolean;
  filter: FloorFilter;
}) {
  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-6">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key === "all" ? "/invest" : `/invest?filter=${f.key}`}
            className={`chip transition ${filter === f.key ? "bg-brand-navy text-white" : "chip-navy hover:bg-brand-mist"}`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {ideas.length === 0 ? (
        <div className="card p-10 text-center">
          <div className="text-5xl mb-3">💡</div>
          <h3 className="text-xl font-black">هنوز ایده‌ای ثبت نشده</h3>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 stagger">
          {ideas.map((idea) => {
            const isOwn = ownTeamId !== null && idea.teamId === ownTeamId;
            const avg = analystAvg(idea);
            const pct = idea.fundingCap > 0 ? Math.min(100, Math.round((idea.raised / idea.fundingCap) * 100)) : 0;
            return (
              <Link
                key={idea.id}
                href={`/invest/${idea.id}`}
                className="card overflow-hidden hover:-translate-y-0.5 hover:shadow-lift transition flex flex-col"
              >
                <div className="relative w-full aspect-[8/5] bg-brand-sky">
                  <Cover src={idea.coverUrl} alt={idea.title} sizes="360px" />
                  {isOwn && <span className="absolute top-3 right-3 chip bg-white/90 text-brand-red">تیم خودت</span>}
                </div>
                <div className="p-4 flex flex-col gap-3 flex-1">
                  <div className="flex items-center gap-2">
                    <Avatar seed={idea.teamLogoSeed || idea.teamId} size={24} />
                    <span className="text-xs font-bold text-brand-slate truncate">{idea.teamName}</span>
                  </div>
                  <h3 className="font-black text-brand-navy leading-6">{idea.title}</h3>
                  <p className="text-sm text-brand-slate line-clamp-2 flex-1">{idea.oneLiner}</p>

                  {avg !== null && (
                    <div className="flex items-center gap-2">
                      <div className="h-2 flex-1 rounded-pill bg-brand-sky overflow-hidden">
                        <div className="h-full rounded-pill bg-brand-cyan" style={{ width: `${avg}%` }} />
                      </div>
                      <span className="text-xs font-bold text-brand-cyan-dark fa-num">{fa(avg)}</span>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <span className="chip-gold">سود سرمایه‌گذار {fa(idea.revenueShare)}٪</span>
                    <span className="chip-navy">{fa(idea.investorCount)} سرمایه‌گذار</span>
                  </div>

                  <div>
                    <div className="h-2 rounded-pill bg-brand-sky overflow-hidden">
                      <div className="h-full rounded-pill bg-brand-red" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="mt-1 flex justify-between text-xs text-brand-slate fa-num">
                      <span>{coins(idea.raised)}</span>
                      <span>از {coins(idea.fundingCap)}</span>
                    </div>
                  </div>

                  <span className={isOwn ? "btn-ghost mt-1 pointer-events-none" : "btn-primary mt-1 pointer-events-none"}>
                    {isOwn ? "خودتأمین" : interactive ? "سرمایه‌گذاری" : "مشاهده"}
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
