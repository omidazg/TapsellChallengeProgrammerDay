"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { MODULE_STATUSES } from "@/lib/modules";
import { invalidate } from "@/lib/ttl-cache";

export type TrackActionState = { error?: string; ok?: boolean };

const weight = z.coerce
  .number({ error: "وزن باید عدد باشد" })
  .int("وزن باید عدد صحیح باشد")
  .min(0, "وزن نمی‌تواند منفی باشد")
  .max(100, "وزن حداکثر ۱۰۰ است");

const schema = z.object({
  trackId: z.string().min(1),
  name: z.string().trim().min(1, "نام محور را بنویس").max(80, "نام خیلی طولانی است"),
  description: z.string().trim().max(1000, "توضیح خیلی طولانی است"),
  status: z.enum(MODULE_STATUSES, { error: "وضعیت نامعتبر است" }),
  order: z.coerce.number({ error: "ترتیب باید عدد باشد" }).int("ترتیب باید عدد صحیح باشد").min(0, "ترتیب نمی‌تواند منفی باشد"),
  ai: weight,
  market: weight,
  jury: weight,
  support: weight,
  activeInstalls: weight,
  revenue: weight,
  rating: weight,
  comments: weight,
});

/** ذخیرهٔ محور: مشخصات، وزن‌ها (هر گروه جمع ۱۰۰) و معیارهای داوری */
export async function saveTrackAction(prevState: TrackActionState, formData: FormData): Promise<TrackActionState> {
  const admin = await requireAdmin();
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "ورودی نامعتبر است" };
  const d = parsed.data;

  if (d.ai + d.market + d.jury !== 100) return { error: "جمع وزن هوش مصنوعی، بازار و داوری باید ۱۰۰ باشد" };
  if (d.support + d.activeInstalls + d.revenue + d.rating + d.comments !== 100) {
    return { error: "جمع زیرشاخص‌های بازار باید ۱۰۰ باشد" };
  }

  const keys = formData.getAll("criterionKey").map((v) => String(v).trim());
  const labels = formData.getAll("criterionLabel").map((v) => String(v).trim());
  const criteria: { key: string; label: string }[] = [];
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const label = labels[i] ?? "";
    if (!key && !label) continue;
    if (!/^[a-zA-Z0-9_-]{1,40}$/.test(key)) return { error: "کلید هر معیار فقط حروف و عدد انگلیسی، خط تیره و زیرخط دارد" };
    if (!label || label.length > 160) return { error: "عنوان هر معیار لازم است و حداکثر ۱۶۰ نویسه دارد" };
    if (criteria.some((c) => c.key === key)) return { error: `کلید «${key}» تکراری است` };
    criteria.push({ key, label });
  }
  if (criteria.length === 0) return { error: "دست‌کم یک معیار داوری لازم است" };
  if (criteria.length > 20) return { error: "حداکثر ۲۰ معیار داوری مجاز است" };

  const before = await prisma.track.findUnique({ where: { id: d.trackId } });
  if (!before) return { error: "محور پیدا نشد" };

  const after = {
    name: d.name,
    description: d.description,
    status: d.status,
    order: d.order,
    weights: JSON.stringify({
      ai: d.ai,
      market: d.market,
      jury: d.jury,
      marketSub: { support: d.support, activeInstalls: d.activeInstalls, revenue: d.revenue, rating: d.rating, comments: d.comments },
    }),
    juryCriteria: JSON.stringify(criteria),
  };
  await prisma.track.update({ where: { id: d.trackId }, data: after });
  await audit(admin.id, "track.update", d.trackId, {
    before: {
      name: before.name,
      description: before.description,
      status: before.status,
      order: before.order,
      weights: before.weights,
      juryCriteria: before.juryCriteria,
    },
    after,
  });
  invalidate("scores:");
  // نام و وضعیت محور در ناوبری و صفحه‌های شرکت‌کننده می‌آید.
  revalidatePath("/", "layout");
  return { ok: true };
}
