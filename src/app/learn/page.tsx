import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { moduleStatusFor } from "@/lib/module-state";
import { parseTeaser } from "@/lib/product-utils";
import { ModuleClosed } from "@/components/ModuleState";
import { PageHeader, Container, Empty } from "@/components/ui";
import { fa } from "@/lib/persian";

export const metadata = { title: "آموزش", description: "ویدیوهای آموزشی ساخت محصول با ابزارهای ساده و هوش مصنوعی." };
export const dynamic = "force-dynamic";

const TITLE = "آموزش";

/** صفحهٔ عمومی آموزش: هر وقت خواستی ببین (بدون نیاز به ورود). */
export default async function LearnPage() {
  const user = await getCurrentUser();
  const status = await moduleStatusFor("learn", user?.teamId);
  if (status === "hidden") notFound();
  if (status === "closed") return <ModuleClosed moduleKey="learn" title={TITLE} />;

  const lessons = await prisma.lesson.findMany({ where: { published: true }, orderBy: [{ order: "asc" }, { createdAt: "asc" }] });

  return (
    <>
      <PageHeader eyebrow="میدان بنیان‌گذاران" title={TITLE} desc="چطور با ابزارهای ساده و هوش مصنوعی سریع محصول بسازیم. ویدیوها همیشه اینجا هستند؛ هر وقت خواستی ببین." />
      <Container className="max-w-4xl space-y-6">
        {lessons.length === 0 ? (
          <Empty title="به‌زودی" desc="ویدیوهای آموزشی به‌زودی اینجا قرار می‌گیرند." />
        ) : (
          lessons.map((l, idx) => {
            const video = parseTeaser(l.videoUrl);
            const links = l.links
              .split("\n")
              .map((s) => s.trim())
              .filter((s) => /^https?:\/\//i.test(s));
            return (
              <article key={l.id} id={`lesson-${l.id}`} className="card p-4 sm:p-6 space-y-4 anim-rise scroll-mt-24">
                <div>
                  <div className="text-xs font-bold text-brand-cyan-dark">درس {fa(idx + 1)}{l.instructor && ` · ${l.instructor}`}</div>
                  <h2 className="mt-1 text-xl font-black text-brand-navy break-words">{l.title}</h2>
                </div>
                {(video.kind === "aparat" || video.kind === "youtube") && video.embedSrc && (
                  <div className="relative w-full aspect-video rounded-2xl overflow-hidden border border-brand-mist bg-black">
                    <iframe src={video.embedSrc} className="w-full h-full" allowFullScreen title={l.title} loading="lazy" />
                  </div>
                )}
                {video.kind === "video" && video.embedSrc && (
                  <a href={video.embedSrc} target="_blank" rel="noopener noreferrer nofollow" className="btn-navy inline-flex">
                    🎬 تماشای ویدیو ↗
                  </a>
                )}
                {l.description && <p className="text-brand-navy leading-7 whitespace-pre-line break-words">{l.description}</p>}
                {links.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-xs font-bold text-brand-slate">ابزارها و لینک‌ها</div>
                    <ul className="flex flex-wrap gap-2">
                      {links.map((href) => (
                        <li key={href}>
                          <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="chip-navy inline-flex max-w-full break-all" dir="ltr">
                            {href.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "")}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </article>
            );
          })
        )}
      </Container>
    </>
  );
}
