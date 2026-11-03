/**
 * ویترین عمومی محصولات (مثل ProductPulse): تیم درخواست می‌دهد، ادمین تأیید می‌کند و محصول با نام سازنده‌ها
 * بدون نیاز به ورود دیده می‌شود. رأی مردمی جدا از قلب بازار است و در امتیاز ۳۰/۳۰/۴۰ اثری ندارد.
 */
import { prisma } from "./db";
import { audit } from "./audit";
import { notifyTeam } from "./notifications";
import { moduleGate } from "./module-state";
import { listVisibleTracks } from "./track-data";
import { parseImages, coverUrl } from "./product-utils";
import { publicName, SHOWCASE_STATUS_LABEL, type ShowcaseSort, type ShowcaseStatus } from "./community";

export * from "./community";

const HOT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** شرط نمایش عمومی: تأییدشده، ثبت نهایی‌شده و در محوری که مخفی نیست */
async function publicWhere() {
  const trackIds = (await listVisibleTracks()).map((t) => t.id);
  return { showcaseStatus: "APPROVED", submittedAt: { not: null }, trackId: { in: trackIds } };
}

export type ShowcaseCard = {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  image: string;
  trackId: string;
  trackName: string;
  teamName: string;
  makers: string[];
  votes: number;
  featured: boolean;
  isLive: boolean;
};

export async function listShowcase(opts: { sort?: ShowcaseSort; trackId?: string } = {}): Promise<ShowcaseCard[]> {
  const where = await publicWhere();
  if (opts.trackId) where.trackId = { in: where.trackId.in.filter((id) => id === opts.trackId) };
  const rows = await prisma.product.findMany({
    where,
    select: {
      id: true,
      slug: true,
      name: true,
      tagline: true,
      images: true,
      trackId: true,
      showcaseFeatured: true,
      showcaseAt: true,
      liveStatus: true,
      track: { select: { name: true } },
      team: { select: { name: true, slug: true, members: { select: { displayName: true, nickname: true } } } },
      _count: { select: { showcaseVotes: true } },
    },
  });

  const recent =
    opts.sort === "hot"
      ? new Map(
          (
            await prisma.showcaseVote.groupBy({
              by: ["productId"],
              where: { productId: { in: rows.map((r) => r.id) }, createdAt: { gte: new Date(Date.now() - HOT_WINDOW_MS) } },
              _count: { _all: true },
            })
          ).map((g) => [g.productId, g._count._all])
        )
      : null;

  const cards = rows.map((p) => ({
    card: {
      id: p.id,
      slug: p.slug,
      name: p.name,
      tagline: p.tagline,
      image: coverUrl(parseImages(p.images), p.team.slug),
      trackId: p.trackId,
      trackName: p.track.name,
      teamName: p.team.name,
      makers: p.team.members.map(publicName),
      votes: p._count.showcaseVotes,
      featured: p.showcaseFeatured,
      isLive: p.liveStatus === "LIVE",
    },
    at: p.showcaseAt?.getTime() ?? 0,
    hot: recent?.get(p.id) ?? 0,
  }));

  if (opts.sort === "new") cards.sort((a, b) => b.at - a.at);
  else if (opts.sort === "hot") cards.sort((a, b) => b.hot - a.hot || b.card.votes - a.card.votes);
  else cards.sort((a, b) => b.card.votes - a.card.votes || b.at - a.at);
  return cards.map((c) => c.card);
}

/** محصول عمومی ویترین (یا null اگر در ویترین نیست) */
export async function getShowcaseProduct(slug: string) {
  const where = await publicWhere();
  const p = await prisma.product.findFirst({
    where: { ...where, slug },
    include: {
      track: { select: { name: true, kind: true } },
      team: { select: { id: true, name: true, slug: true, members: { select: { id: true, displayName: true, nickname: true, avatarSeed: true } } } },
      _count: { select: { showcaseVotes: true } },
    },
  });
  if (!p) return null;
  return {
    ...p,
    images: parseImages(p.images),
    votes: p._count.showcaseVotes,
    makers: p.team.members.map((m) => ({ id: m.id, name: publicName(m), avatarSeed: m.avatarSeed })),
  };
}

export async function hasVoted(userId: string, productId: string): Promise<boolean> {
  return !!(await prisma.showcaseVote.findUnique({ where: { productId_userId: { productId, userId } } }));
}

type Result = { error?: string; ok?: boolean };

/** رأی دادن یا پس گرفتن رأی (هر نفر یک رأی برای هر محصول؛ رأی به محصول تیم خودت ممنوع) */
export async function toggleVote(user: { id: string; teamId: string | null }, productId: string): Promise<Result & { voted?: boolean }> {
  const gate = await moduleGate("showcase", user.teamId);
  if (gate) return { error: gate };
  const product = await prisma.product.findFirst({ where: { ...(await publicWhere()), id: productId }, select: { teamId: true } });
  if (!product) return { error: "این محصول در ویترین نیست." };
  if (product.teamId === user.teamId) return { error: "به محصول تیم خودت نمی‌توانی رأی بدهی." };

  const key = { productId_userId: { productId, userId: user.id } };
  if (await prisma.showcaseVote.findUnique({ where: key })) {
    await prisma.showcaseVote.delete({ where: key });
    return { ok: true, voted: false };
  }
  try {
    await prisma.showcaseVote.create({ data: { productId, userId: user.id } });
  } catch {
    // درخواست هم‌زمان: رأی قبلاً ثبت شده است
  }
  return { ok: true, voted: true };
}

/** درخواست نمایش محصول در ویترین (یا ارسال دوباره پس از «نیاز به اصلاح») */
export async function requestShowcase(user: { id: string; teamId: string | null }, trackId: string): Promise<Result> {
  if (!user.teamId) return { error: "ابتدا باید عضو یک تیم باشی." };
  const gate = await moduleGate("showcase", user.teamId);
  if (gate) return { error: gate };
  const product = await prisma.product.findUnique({
    where: { teamId_trackId: { teamId: user.teamId, trackId } },
    select: { id: true, submittedAt: true, showcaseStatus: true },
  });
  if (!product) return { error: "هنوز محصولی در این محور نساخته‌ای." };
  if (!product.submittedAt) return { error: "اول محصولت را ثبت نهایی کن." };
  if (product.showcaseStatus === "REQUESTED" || product.showcaseStatus === "APPROVED") return { error: "درخواست قبلاً ثبت شده است." };
  await prisma.product.update({ where: { id: product.id }, data: { showcaseStatus: "REQUESTED", showcaseNote: "" } });
  return { ok: true };
}

/** پس گرفتن درخواست یا بیرون آوردن محصول از ویترین (رأی‌ها می‌مانند) */
export async function withdrawShowcase(user: { id: string; teamId: string | null }, trackId: string): Promise<Result> {
  if (!user.teamId) return { error: "ابتدا باید عضو یک تیم باشی." };
  const product = await prisma.product.findUnique({ where: { teamId_trackId: { teamId: user.teamId, trackId } }, select: { id: true } });
  if (!product) return { error: "محصول پیدا نشد." };
  await prisma.product.update({ where: { id: product.id }, data: { showcaseStatus: "", showcaseFeatured: false } });
  return { ok: true };
}

/** تصمیم ادمین روی درخواست */
export async function reviewShowcase(adminId: string, productId: string, decision: "APPROVED" | "REJECTED", note: string): Promise<Result> {
  const product = await prisma.product.findUnique({ where: { id: productId }, select: { teamId: true, name: true, slug: true, showcaseAt: true } });
  if (!product) return { error: "محصول پیدا نشد." };
  await prisma.product.update({
    where: { id: productId },
    data: {
      showcaseStatus: decision,
      showcaseNote: decision === "REJECTED" ? note : "",
      showcaseFeatured: decision === "APPROVED" ? undefined : false,
      // زمان اولین ورود به ویترین مبنای «تازه‌ها» است
      showcaseAt: decision === "APPROVED" ? (product.showcaseAt ?? new Date()) : undefined,
    },
  });
  await audit(adminId, `showcase.${decision === "APPROVED" ? "approve" : "reject"}`, productId, { note });
  await notifyTeam(product.teamId, {
    kind: "showcase",
    title: decision === "APPROVED" ? `«${product.name}» در ویترین قرار گرفت` : `درخواست ویترین «${product.name}» نیاز به اصلاح دارد`,
    body: decision === "REJECTED" ? note : "لینکش را با دوستانت به اشتراک بگذار.",
    href: decision === "APPROVED" ? `/showcase/${product.slug}` : "/build",
  });
  return { ok: true };
}

export async function setShowcaseFeatured(adminId: string, productId: string, featured: boolean): Promise<Result> {
  const product = await prisma.product.findUnique({ where: { id: productId }, select: { showcaseStatus: true } });
  if (!product || product.showcaseStatus !== "APPROVED") return { error: "فقط محصول تأییدشده می‌تواند ویژه شود." };
  await prisma.product.update({ where: { id: productId }, data: { showcaseFeatured: featured } });
  await audit(adminId, "showcase.feature", productId, { featured });
  return { ok: true };
}

export function showcaseStatusLabel(status: string): string {
  return status ? (SHOWCASE_STATUS_LABEL[status as Exclude<ShowcaseStatus, "">] ?? status) : "";
}
