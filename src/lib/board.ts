/**
 * بورد خبر (مثل Buildside): تیم‌ها پست کوتاه پیشرفت، لانچ، درخواست بازخورد یا درس‌آموخته می‌گذارند.
 * دیدن آزاد است؛ نوشتن فقط برای اعضای تیم. به پست سکه داده نمی‌شود چون سکه روی امتیاز اثر دارد.
 */
import { prisma } from "./db";
import { audit } from "./audit";
import { notifyTeam } from "./notifications";
import { moduleGate } from "./module-state";
import { imageUrlError } from "./product-utils";
import { BOARD_BODY_MAX, BOARD_POSTS_PER_DAY, isBoardKind, publicName, type BoardKind } from "./community";

export * from "./community";

const DAY_MS = 24 * 60 * 60 * 1000;
export const BOARD_PAGE_SIZE = 30;

export type BoardPostView = {
  id: string;
  kind: BoardKind;
  body: string;
  imageUrl: string;
  linkUrl: string;
  featured: boolean;
  createdAt: Date;
  teamId: string;
  teamName: string;
  authorName: string;
  authorSeed: string;
  product: { name: string; slug: string; inShowcase: boolean } | null;
};

const postSelect = {
  id: true,
  kind: true,
  body: true,
  imageUrl: true,
  linkUrl: true,
  featured: true,
  createdAt: true,
  teamId: true,
  team: { select: { name: true } },
  author: { select: { id: true, displayName: true, nickname: true, avatarSeed: true } },
  product: { select: { name: true, slug: true, showcaseStatus: true, submittedAt: true } },
} as const;

type PostRow = {
  id: string;
  kind: string;
  body: string;
  imageUrl: string;
  linkUrl: string;
  featured: boolean;
  createdAt: Date;
  teamId: string;
  team: { name: string };
  author: { id: string; displayName: string; nickname: string; avatarSeed: string };
  product: { name: string; slug: string; showcaseStatus: string; submittedAt: Date | null } | null;
};

function toView(p: PostRow): BoardPostView {
  return {
    id: p.id,
    kind: isBoardKind(p.kind) ? p.kind : "PROGRESS",
    body: p.body,
    imageUrl: p.imageUrl,
    linkUrl: p.linkUrl,
    featured: p.featured,
    createdAt: p.createdAt,
    teamId: p.teamId,
    teamName: p.team.name,
    authorName: publicName(p.author),
    authorSeed: p.author.avatarSeed || p.author.id,
    product: p.product
      ? { name: p.product.name, slug: p.product.slug, inShowcase: p.product.showcaseStatus === "APPROVED" && !!p.product.submittedAt }
      : null,
  };
}

/** پست‌های عمومی، تازه‌ترین اول؛ «آپدیت‌های هفته» جدا برگردانده می‌شوند */
export async function listBoard(opts: { page?: number; teamId?: string; productId?: string } = {}) {
  const page = Math.max(1, opts.page ?? 1);
  const where = { hidden: false, ...(opts.teamId ? { teamId: opts.teamId } : {}), ...(opts.productId ? { productId: opts.productId } : {}) };
  const [rows, total, featured] = await Promise.all([
    prisma.boardPost.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * BOARD_PAGE_SIZE, take: BOARD_PAGE_SIZE, select: postSelect }),
    prisma.boardPost.count({ where }),
    opts.teamId || opts.productId || page > 1
      ? Promise.resolve([])
      : prisma.boardPost.findMany({ where: { hidden: false, featured: true }, orderBy: { createdAt: "desc" }, take: 3, select: postSelect }),
  ]);
  return { posts: rows.map(toView), featured: featured.map(toView), page, pages: Math.max(1, Math.ceil(total / BOARD_PAGE_SIZE)) };
}

export async function getBoardPost(id: string): Promise<BoardPostView | null> {
  const p = await prisma.boardPost.findFirst({ where: { id, hidden: false }, select: postSelect });
  return p ? toView(p) : null;
}

type Result = { error?: string; ok?: boolean; id?: string };

export type BoardPostInput = { kind: string; body: string; imageUrl: string; linkUrl: string; productId: string };

export async function createBoardPost(user: { id: string; teamId: string | null }, input: BoardPostInput): Promise<Result> {
  if (!user.teamId) return { error: "برای نوشتن در بورد باید عضو یک تیم باشی." };
  const gate = await moduleGate("board", user.teamId);
  if (gate) return { error: gate };

  if (!isBoardKind(input.kind)) return { error: "نوع پست را انتخاب کن." };
  const body = input.body.trim();
  if (!body) return { error: "متن پست را بنویس." };
  if (body.length > BOARD_BODY_MAX) return { error: `متن پست حداکثر ${BOARD_BODY_MAX} نویسه است.` };
  const imageUrl = input.imageUrl.trim();
  const imgError = imageUrlError(imageUrl);
  if (imgError) return { error: imgError };
  const linkUrl = input.linkUrl.trim();
  if (linkUrl && (linkUrl.length > 400 || !/^https?:\/\//i.test(linkUrl))) return { error: "لینک باید با http یا https شروع شود." };

  let productId: string | null = null;
  if (input.productId) {
    const product = await prisma.product.findFirst({ where: { id: input.productId, teamId: user.teamId }, select: { id: true } });
    if (!product) return { error: "محصول انتخاب‌شده مال تیم تو نیست." };
    productId = product.id;
  }

  const recent = await prisma.boardPost.count({ where: { teamId: user.teamId, createdAt: { gte: new Date(Date.now() - DAY_MS) } } });
  if (recent >= BOARD_POSTS_PER_DAY) return { error: `هر تیم در ۲۴ ساعت حداکثر ${BOARD_POSTS_PER_DAY} پست می‌گذارد.` };

  const post = await prisma.boardPost.create({
    data: { teamId: user.teamId, authorId: user.id, productId, kind: input.kind, body, imageUrl, linkUrl },
    select: { id: true },
  });
  return { ok: true, id: post.id };
}

/** حذف پست توسط هر عضو همان تیم */
export async function deleteBoardPost(user: { id: string; teamId: string | null }, postId: string): Promise<Result> {
  const post = await prisma.boardPost.findUnique({ where: { id: postId }, select: { teamId: true } });
  if (!post || !user.teamId || post.teamId !== user.teamId) return { error: "فقط اعضای همان تیم می‌توانند پست را حذف کنند." };
  await prisma.boardPost.delete({ where: { id: postId } });
  return { ok: true };
}

export async function reportBoardPost(user: { id: string }, postId: string, reason: string): Promise<Result> {
  const post = await prisma.boardPost.findUnique({ where: { id: postId }, select: { id: true } });
  if (!post) return { error: "پست پیدا نشد." };
  try {
    await prisma.boardReport.create({ data: { postId, userId: user.id, reason: reason.trim().slice(0, 300) } });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") return { error: "این پست را قبلاً گزارش داده‌ای." };
    throw e;
  }
  return { ok: true };
}

export async function moderateBoardPost(adminId: string, postId: string, change: { hidden?: boolean; featured?: boolean }): Promise<Result> {
  const post = await prisma.boardPost.findUnique({ where: { id: postId }, select: { teamId: true, featured: true } });
  if (!post) return { error: "پست پیدا نشد." };
  await prisma.boardPost.update({ where: { id: postId }, data: change });
  await audit(adminId, "board.moderate", postId, change);
  if (change.featured && !post.featured) {
    await notifyTeam(post.teamId, { kind: "board", title: "پستتان «آپدیت هفته» شد 🎉", body: "پست تیمتان بالای بورد خبر نمایش داده می‌شود.", href: `/board/${postId}` });
  }
  return { ok: true };
}
