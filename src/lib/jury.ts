/**
 * داوری نهایی: هر داور مستقل به معیارهای محور نمره می‌دهد (هر معیار ۰..۱۰) و نمرهٔ نهایی میانگین داورهاست.
 * معیارهای هر محور در پنل قابل تنظیم است (track.juryCriteria).
 */
import { prisma } from "./db";
import { moduleGate } from "./module-state";
import { parseCriteria } from "./tracks";
import { invalidate } from "./ttl-cache";

/** آیا این کاربر می‌تواند داوری کند؟ */
export function canJudge(user: { isAdmin: boolean; staffRole: string }): boolean {
  return user.isAdmin || user.staffRole === "JUDGE";
}

export type JuryRow = {
  productId: string;
  productName: string;
  productSlug: string;
  teamName: string;
  trackId: string;
  criteria: { key: string; label: string }[];
  mine: Record<string, number>;
  myNote: string;
  judgeCount: number;
};

function parseScores(raw: string): Record<string, number> {
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

/** همهٔ محصول‌های ثبت‌نهایی‌شده (داوری روی همهٔ تیم‌ها انجام می‌شود) با نمرهٔ همین داور. */
export async function listJuryRows(judgeId: string): Promise<JuryRow[]> {
  const products = await prisma.product.findMany({
    where: { submittedAt: { not: null } },
    include: {
      team: { select: { name: true } },
      track: { select: { id: true, juryCriteria: true, order: true } },
      juryScores: { select: { judgeId: true, scores: true, note: true } },
    },
  });
  return products
    .sort((a, b) => a.track.order - b.track.order || a.name.localeCompare(b.name, "fa"))
    .map((p) => {
      const mine = p.juryScores.find((j) => j.judgeId === judgeId);
      return {
        productId: p.id,
        productName: p.name,
        productSlug: p.slug,
        teamName: p.team.name,
        trackId: p.track.id,
        criteria: parseCriteria(p.track.juryCriteria),
        mine: mine ? parseScores(mine.scores) : {},
        myNote: mine?.note ?? "",
        judgeCount: p.juryScores.length,
      };
    });
}

/** ثبت یا ویرایش نمرهٔ یک داور برای یک محصول */
export async function saveJuryScore(
  judgeId: string,
  productId: string,
  input: { scores: Record<string, unknown>; note?: string }
): Promise<{ ok?: boolean; error?: string }> {
  const gate = await moduleGate("jury");
  if (gate) return { error: gate };
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { submittedAt: true, track: { select: { juryCriteria: true } } },
  });
  if (!product?.submittedAt) return { error: "این محصول هنوز ثبت نهایی نشده است." };

  const scores: Record<string, number> = {};
  for (const c of parseCriteria(product.track.juryCriteria)) {
    const v = input.scores[c.key];
    if (v === null || v === undefined || v === "") continue;
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n) || n < 0 || n > 10) return { error: "هر نمره باید عددی بین ۰ تا ۱۰ باشد." };
    scores[c.key] = n;
  }
  const value = JSON.stringify(scores);
  const note = (input.note ?? "").trim().slice(0, 600);
  await prisma.juryScore.upsert({
    where: { productId_judgeId: { productId, judgeId } },
    update: { scores: value, note },
    create: { productId, judgeId, scores: value, note },
  });
  invalidate("scores:");
  return { ok: true };
}
