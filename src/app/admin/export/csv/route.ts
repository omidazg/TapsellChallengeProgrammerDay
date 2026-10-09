import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { computeScores, LEDGER_REASON_LABEL, WALLET_LABEL } from "@/lib/scoring";
import { getSettledAt, loadSettledOutput } from "@/lib/settlement";
import { SCORE_CATEGORY_ORDER, SCORE_CATEGORY_LABELS } from "@/lib/score-labels";

// BOM تا اکسل فارسی فایل را UTF-8 بخواند
const BOM = "﻿";

export const dynamic = "force-dynamic";

const COIN_ORDER_STATUS_LABEL: Record<string, string> = {
  PENDING: "در انتظار پرداخت",
  PAID: "پرداخت‌شده",
  FAILED: "ناموفق / ردشده",
  CANCELED: "لغو کاربر",
};

function csvCell(v: string | number): string {
  let s = String(v);
  // جلوگیری از تزریق فرمول (CSV injection): نام تیم/نام مستعار را کاربر می‌نویسد و اکسل
  // سلول متنیِ شروع‌شده با = + - @ (یا تب/CR) را فرمول اجرا می‌کند. عددها (مثل تغییر منفی) دست نمی‌خورند.
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(rows: (string | number)[][]): string {
  return BOM + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

function csvResponse(body: string, filename: string) {
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** خروجی CSV امتیاز تیم‌ها، دفتر کل کامل یا سفارش‌های سکه، برای پنل برگزارکننده. */
export async function GET(req: NextRequest) {
  await requireAdmin();
  const type = req.nextUrl.searchParams.get("type") ?? "teams";

  if (type === "ledger") {
    const entries = await prisma.ledgerEntry.findMany({
      include: { user: { select: { nickname: true } } },
      orderBy: { createdAt: "asc" },
    });
    const teams = await prisma.team.findMany({ select: { id: true, name: true } });
    const teamNames = new Map(teams.map((t) => [t.id, t.name]));

    const rows: (string | number)[][] = [
      ["شناسه", "کاربر", "تیم", "کیف", "تغییر", "دلیل", "مرجع", "زمان"],
      ...entries.map((e) => [
        e.id,
        e.user?.nickname ?? "",
        e.teamId ? teamNames.get(e.teamId) ?? e.teamId : "",
        WALLET_LABEL[e.wallet] ?? e.wallet,
        e.delta,
        LEDGER_REASON_LABEL[e.reason] ?? e.reason,
        e.refId ?? "",
        e.createdAt.toISOString(),
      ]),
    ];
    return csvResponse(toCsv(rows), "ledger.csv");
  }

  if (type === "coins") {
    const orders = await prisma.coinOrder.findMany({
      include: { user: { select: { nickname: true } } },
      orderBy: { createdAt: "asc" },
    });
    const rows: (string | number)[][] = [
      ["شناسه", "کاربر", "سکه", "مبلغ (تومان)", "وضعیت", "درگاه", "کد پیگیری", "یادداشت", "زمان ثبت", "زمان پرداخت"],
      ...orders.map((o) => [
        o.id,
        o.user?.nickname ?? "",
        o.coins,
        Math.round(o.amountRial / 10),
        COIN_ORDER_STATUS_LABEL[o.status] ?? o.status,
        o.gateway,
        o.refId ?? "",
        o.note,
        o.createdAt.toISOString(),
        o.paidAt?.toISOString() ?? "",
      ]),
    ];
    return csvResponse(toCsv(rows), "coin-orders.csv");
  }

  // بعد از تسویه همان عددهای ثبت‌شده؛ پیش از آن محاسبهٔ زنده
  const [output, teams, products] = await Promise.all([
    getSettledAt().then((at) => (at ? loadSettledOutput() : computeScores())),
    prisma.team.findMany({ select: { id: true, name: true, solo: true, cheatNote: true } }),
    prisma.product.findMany({ select: { teamId: true, juryWorks: true, juryValue: true, juryPitch: true, liveStatus: true } }),
  ]);
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const productByTeam = new Map(products.map((p) => [p.teamId, p]));
  const opt = (v: number | null | undefined) => (v === null || v === undefined ? "" : v);

  const rows: (string | number)[][] = [
    [
      "رتبه",
      "تیم",
      "تعداد اعضا",
      "شرکت فردی",
      "داوری: کار می‌کند؟ (۰..۱۰)",
      "داوری: ارزش واقعی (۰..۱۰)",
      "داوری: تیزر و ارائه (۰..۱۰)",
      "داوری انسانی (۰..۱۰۰)",
      "حمایت مردمی (خام)",
      "تعداد حامیان",
      "سکهٔ دریافتی",
      "داوری هوش مصنوعی (۰..۱۰۰)",
      "لایو روی بازار استودیو",
      ...SCORE_CATEGORY_ORDER.map((k) => `امتیاز ${SCORE_CATEGORY_LABELS[k].label}`),
      "کسر تقلب",
      "توضیح کسر تقلب",
      "امتیاز کل",
    ],
    ...[...output.teams]
      .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
      .map((t) => {
        const team = teamById.get(t.teamId);
        const p = productByTeam.get(t.teamId);
        return [
          t.rank ?? "",
          team?.name ?? t.teamId,
          t.memberCount,
          team?.solo ? "بله" : "خیر",
          opt(p?.juryWorks),
          opt(p?.juryValue),
          opt(p?.juryPitch),
          t.juryRaw === null ? "" : r1(t.juryRaw),
          r1(t.people),
          t.supporters,
          t.coinsReceived,
          t.ai === null ? "" : r1(t.ai),
          p?.liveStatus === "LIVE" ? "بله" : "خیر",
          ...SCORE_CATEGORY_ORDER.map((k) => r1(t.pts[k])),
          t.cheatPenalty,
          team?.cheatNote ?? "",
          r1(t.total),
        ];
      }),
  ];
  return csvResponse(toCsv(rows), "team-scores.csv");
}
