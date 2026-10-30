"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { setSetting } from "@/lib/admin";
import { runFinalAiEvaluation } from "@/lib/jury-ai";
import { getSettledAt, resettleGame } from "@/lib/settlement";

const RUN_KEY = "final_ai_run";
/** اگر پردازش وسط کار از بین رفته باشد، پس از این مدت می‌شود دوباره اجرا کرد. */
const STALE_MS = 2 * 60 * 60 * 1000;

type StoredRun = { startedAt: string; finishedAt?: string; done?: number; failed?: number; error?: boolean };

export type FinalAiStatus = {
  running: boolean;
  /** چند محصول در همین اجرا ارزیابی شده‌اند */
  evaluated: number;
  total: number;
  /** نتیجهٔ آخرین اجرای تمام‌شده */
  last: { done: number; failed: number; finishedAt: string; error: boolean } | null;
  error?: string;
};

async function readRun(): Promise<StoredRun | null> {
  const row = await prisma.setting.findUnique({ where: { key: RUN_KEY } });
  if (!row?.value) return null;
  try {
    return JSON.parse(row.value) as StoredRun;
  } catch {
    return null;
  }
}

function isRunning(run: StoredRun | null): boolean {
  return !!run && !run.finishedAt && Date.now() - new Date(run.startedAt).getTime() < STALE_MS;
}

async function statusOf(run: StoredRun | null): Promise<FinalAiStatus> {
  const running = isRunning(run);
  const [total, evaluated] = await Promise.all([
    prisma.product.count({ where: { submittedAt: { not: null } } }),
    running && run
      ? prisma.product.count({ where: { submittedAt: { not: null }, aiFinal: { not: null }, updatedAt: { gte: new Date(run.startedAt) } } })
      : Promise.resolve(0),
  ]);
  return {
    running,
    evaluated,
    total,
    last: run?.finishedAt ? { done: run.done ?? 0, failed: run.failed ?? 0, finishedAt: run.finishedAt, error: !!run.error } : null,
  };
}

/** وضعیت فعلی ارزیابی نهایی؛ فرم پیشرفت با این نظرسنجی می‌کند. */
export async function finalAiStatusAction(): Promise<FinalAiStatus> {
  await requireAdmin();
  return statusOf(await readRun());
}

/**
 * ارزیابی نهایی هوش مصنوعی برای همهٔ محصول‌ها. زمان‌بر است، پس در پس‌زمینه اجرا می‌شود و نتیجه در Setting
 * می‌ماند تا درخواست از مهلت پروکسی نگذرد. اگر تسویه انجام شده باشد، امتیازها بازمحاسبه می‌شوند.
 */
export async function startFinalAiAction(): Promise<FinalAiStatus> {
  const admin = await requireAdmin();
  const current = await readRun();
  if (isRunning(current)) return { ...(await statusOf(current)), error: "ارزیابی نهایی همین حالا در جریان است." };

  const run: StoredRun = { startedAt: new Date().toISOString() };
  await setSetting(RUN_KEY, JSON.stringify(run));
  await audit(admin.id, "settlement.final_ai", "", { startedAt: run.startedAt });

  void (async () => {
    let finished: StoredRun;
    try {
      const { done, failed } = await runFinalAiEvaluation();
      if (done > 0 && (await getSettledAt())) await resettleGame();
      finished = { ...run, finishedAt: new Date().toISOString(), done, failed };
    } catch (e) {
      console.error("runFinalAiEvaluation failed", e);
      finished = { ...run, finishedAt: new Date().toISOString(), error: true };
    }
    await setSetting(RUN_KEY, JSON.stringify(finished)).catch((e) => console.error("final_ai_run write failed", e));
  })();

  revalidatePath("/admin/settlement");
  return statusOf(run);
}
