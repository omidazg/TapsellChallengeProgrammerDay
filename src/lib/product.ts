import { prisma } from "./db";
export * from "./product-utils";
import { parseImages } from "./product-utils";
/** محصول تیم برای صفحهٔ مرکز ساخت */
export async function getProductForTeam(teamId: string) {
  return prisma.product.findUnique({ where: { teamId } });
}

export type ProductDetail = {
  id: string;
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
  juryQuality: number | null;
  hasAuction: boolean;
  members: { id: string; nickname: string; avatarSeed: string; role: string }[];
};

/** محصول از روی اسلاگ تیم، برای صفحهٔ عمومی /market/[slug] */
export async function getProductBySlug(slug: string): Promise<ProductDetail | null> {
  const team = await prisma.team.findUnique({
    where: { slug },
    include: {
      product: { include: { auction: { select: { id: true } } } },
      members: { select: { id: true, nickname: true, avatarSeed: true, role: true } },
    },
  });
  if (!team || !team.product) return null;
  const p = team.product;
  return {
    id: p.id,
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
    aiQuality: p.aiQuality,
    aiNotes: p.aiNotes,
    juryQuality: p.juryQuality,
    hasAuction: !!p.auction,
    members: team.members,
  };
}
