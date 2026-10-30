/**
 * انتشار روی «بازار استودیو»: تیم از فرم ساخت محصول درخواست انتشار می‌دهد (لینک کد/بسته + توضیح)،
 * برگزارکننده در /admin/studio پیگیری و وضعیت را به‌روز می‌کند. محصول منتشرشده نشان «🚀 لایو»
 * می‌گیرد و آمار واقعی‌اش (نصب، درآمد، امتیاز، نظر) در بخش بازار امتیاز حساب می‌شود (./bazaar.ts).
 */
import { z } from "zod";
import { prisma } from "./db";
import { moduleGate } from "./module-state";
import { notifyTeam } from "./notifications";

export type LiveStatus = "" | "REQUESTED" | "PUBLISHING" | "LIVE" | "REJECTED";

export const LIVE_STATUS_LABEL: Record<Exclude<LiveStatus, "">, string> = {
  REQUESTED: "درخواست ثبت شده",
  PUBLISHING: "در حال انتشار",
  LIVE: "🚀 لایو روی بازار استودیو",
  REJECTED: "نیاز به اصلاح",
};

const requestSchema = z.object({
  bazaarPackage: z
    .string()
    .trim()
    .max(200, "شناسهٔ بسته خیلی بلند است")
    .refine((v) => v === "" || /^[a-zA-Z][\w]*(\.[a-zA-Z][\w]*)+$/.test(v), "شناسهٔ بسته باید مثل com.example.app باشد")
    .default(""),
  sourceUrl: z
    .string()
    .trim()
    .max(400, "لینک خیلی بلند است")
    .refine((v) => /^https?:\/\//i.test(v), "لینک کد یا بستهٔ محصول باید با http شروع شود"),
  note: z.string().trim().max(600, "توضیح خیلی بلند است").default(""),
});

export type StudioResult = { ok?: boolean; error?: string };

/** درخواست انتشار (یا ارسال دوباره پس از «نیاز به اصلاح») — هر عضو تیم */
export async function requestGoLive(
  user: { id: string; teamId: string | null },
  trackId: string,
  input: { sourceUrl: string; note?: string; bazaarPackage?: string }
): Promise<StudioResult> {
  if (!user.teamId) return { error: "ابتدا باید عضو یک تیم باشی." };
  const gate = await moduleGate("studio", user.teamId);
  if (gate) return { error: gate };
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "اطلاعات نامعتبر است." };

  const product = await prisma.product.findUnique({
    where: { teamId_trackId: { teamId: user.teamId, trackId } },
    select: { id: true, liveStatus: true, submittedAt: true },
  });
  if (!product) return { error: "اول پیش‌نویس محصول را ذخیره کن." };
  if (!product.submittedAt) return { error: "اول محصولت را ثبت نهایی کن، بعد درخواست انتشار بده." };
  if (product.liveStatus === "LIVE") return { error: "محصولت همین حالا لایو است." };
  if (product.liveStatus === "PUBLISHING") return { error: "انتشار محصولت در جریان است." };

  await prisma.product.update({
    where: { id: product.id },
    data: {
      liveStatus: "REQUESTED",
      liveSourceUrl: parsed.data.sourceUrl,
      bazaarPackage: parsed.data.bazaarPackage,
      liveRequestNote: parsed.data.note,
      liveRequestedAt: new Date(),
      liveAdminNote: "",
    },
  });
  return { ok: true };
}

/** لغو درخواست (تا پیش از شروع انتشار) */
export async function cancelGoLive(user: { id: string; teamId: string | null }, trackId: string): Promise<StudioResult> {
  if (!user.teamId) return { error: "ابتدا باید عضو یک تیم باشی." };
  const res = await prisma.product.updateMany({
    where: { teamId: user.teamId, trackId, liveStatus: { in: ["REQUESTED", "REJECTED"] } },
    data: { liveStatus: "" },
  });
  return res.count > 0 ? { ok: true } : { error: "درخواستی برای لغو وجود ندارد." };
}

const adminSchema = z.object({
  status: z.enum(["REQUESTED", "PUBLISHING", "LIVE", "REJECTED", ""]),
  liveUrl: z.string().trim().max(400).default(""),
  note: z.string().trim().max(600).default(""),
});

/** برگزارکننده: تغییر وضعیت انتشار یک محصول */
export async function adminSetLiveStatus(productId: string, input: { status: string; liveUrl?: string; note?: string }): Promise<StudioResult> {
  const parsed = adminSchema.safeParse(input);
  if (!parsed.success) return { error: "اطلاعات نامعتبر است." };
  const { status, liveUrl, note } = parsed.data;
  if (status === "LIVE" && !/^https?:\/\//i.test(liveUrl)) return { error: "برای وضعیت لایو، لینک محصول منتشرشده لازم است." };

  const product = await prisma.product.findUnique({ where: { id: productId }, select: { teamId: true, name: true } });
  if (!product) return { error: "محصول پیدا نشد." };
  await prisma.product.update({
    where: { id: productId },
    data: {
      liveStatus: status,
      liveAdminNote: note,
      ...(status === "LIVE" ? { liveUrl, liveAt: new Date() } : {}),
      ...(status === "" ? { liveUrl: "", liveAt: null } : {}),
    },
  });

  if (status === "LIVE" || status === "REJECTED" || status === "PUBLISHING") {
    await notifyTeam(product.teamId, {
      kind: "studio",
      title:
        status === "LIVE"
          ? `🚀 «${product.name}» روی بازار استودیو لایو شد`
          : status === "PUBLISHING"
            ? "انتشار محصولت شروع شد"
            : "درخواست انتشار نیاز به اصلاح دارد",
      body: note || undefined,
      href: "/build",
    }).catch(() => {});
  }
  return { ok: true };
}

export type StudioRow = {
  productId: string;
  productName: string;
  teamName: string;
  slug: string;
  bazaarPackage: string;
  status: LiveStatus;
  sourceUrl: string;
  requestNote: string;
  liveUrl: string;
  adminNote: string;
  requestedAt: Date | null;
  liveAt: Date | null;
};

/** فهرست درخواست‌ها برای پنل برگزارکننده (درخواست‌های باز اول) */
export async function listStudioRequests(): Promise<StudioRow[]> {
  const products = await prisma.product.findMany({
    where: { liveStatus: { not: "" } },
    include: { team: { select: { name: true, slug: true } } },
    orderBy: { liveRequestedAt: "asc" },
  });
  const order: Record<string, number> = { REQUESTED: 0, PUBLISHING: 1, REJECTED: 2, LIVE: 3 };
  return products
    .map((p) => ({
      productId: p.id,
      productName: p.name,
      teamName: p.team.name,
      slug: p.slug,
      bazaarPackage: p.bazaarPackage,
      status: p.liveStatus as LiveStatus,
      sourceUrl: p.liveSourceUrl,
      requestNote: p.liveRequestNote,
      liveUrl: p.liveUrl,
      adminNote: p.liveAdminNote,
      requestedAt: p.liveRequestedAt,
      liveAt: p.liveAt,
    }))
    .sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9));
}
