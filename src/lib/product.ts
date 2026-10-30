import { prisma } from "./db";
export * from "./product-utils";
import { parseImages } from "./product-utils";
import { DEFAULTS } from "./constants";

/** محصول تیم در یک محور برای صفحهٔ مرکز ساخت */
export async function getProductForTeam(teamId: string, trackId: string) {
  return prisma.product.findUnique({ where: { teamId_trackId: { teamId, trackId } } });
}

/** نشانی یکتای محصول: اسلاگ تیم به‌اضافهٔ شناسهٔ محور */
export function productSlug(teamSlug: string, trackId: string): string {
  return `${teamSlug}-${trackId}`;
}

/**
 * حداکثر قیمت یک محصول (سکه). هم در اعتبارسنجی سمت سرور و هم در چک‌لیست/فرم مرکز ساخت استفاده می‌شود.
 */
export async function effectiveMaxPrice(): Promise<number> {
  return DEFAULTS.maxPrice;
}

export type ProductDetail = {
  id: string;
  slug: string;
  trackId: string;
  trackName: string;
  deliverableUrl: string;
  contentType: string;
  preExistingNote: string;
  liveStatus: string;
  liveUrl: string;
  teamId: string;
  teamName: string;
  teamSlug: string;
  teamLogoSeed: string;
  name: string;
  tagline: string;
  description: string;
  demoUrl: string;
  teaserUrl: string;
  images: string[];
  price: number;
  specialName: string;
  specialDesc: string;
  specialStart: number;
  submittedAt: Date | null;
  aiQuality: number | null;
  aiNotes: string | null;
  hasAuction: boolean;
  members: { id: string; nickname: string; avatarSeed: string; role: string }[];
};

/** محصول از روی نشانی آن، برای صفحهٔ عمومی /market/[slug] */
export async function getProductBySlug(slug: string): Promise<ProductDetail | null> {
  const p = await prisma.product.findUnique({
    where: { slug },
    include: {
      auction: { select: { id: true } },
      track: { select: { name: true } },
      team: { include: { members: { select: { id: true, nickname: true, avatarSeed: true, role: true } } } },
    },
  });
  if (!p) return null;
  const team = p.team;
  return {
    id: p.id,
    slug: p.slug,
    trackId: p.trackId,
    trackName: p.track.name,
    deliverableUrl: p.deliverableUrl,
    contentType: p.contentType,
    preExistingNote: p.preExistingNote,
    liveStatus: p.liveStatus,
    liveUrl: p.liveUrl,
    teamId: team.id,
    teamName: team.name,
    teamSlug: team.slug,
    teamLogoSeed: team.logoSeed,
    name: p.name,
    tagline: p.tagline,
    description: p.description,
    demoUrl: p.demoUrl,
    teaserUrl: p.teaserUrl,
    images: parseImages(p.images),
    price: p.price,
    specialName: p.specialName,
    specialDesc: p.specialDesc,
    specialStart: p.specialStart,
    submittedAt: p.submittedAt,
    aiQuality: p.aiFinal ?? p.aiQuality,
    aiNotes: p.aiFinalNotes ?? p.aiNotes,
    hasAuction: !!p.auction,
    members: team.members,
  };
}
