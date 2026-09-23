import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { computeScores, LEDGER_REASON_LABEL, WALLET_LABEL } from "@/lib/scoring";
import { SCORE_CATEGORY_ORDER, SCORE_CATEGORY_LABELS } from "@/lib/score-labels";

// BOM تا اکسل فارسی فایل را UTF-8 بخواند
const BOM = "﻿";

export const dynamic = "force-dynamic";

function csvCell(v: string | number): string {
  const s = String(v);
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

/** خروجی CSV امتیاز تیم‌ها یا دفتر کل کامل، برای پنل برگزارکننده. */
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

  const [output, teams] = await Promise.all([
    computeScores(),
    prisma.team.findMany({ select: { id: true, name: true, slug: true } }),
  ]);
  const teamNames = new Map(teams.map((t) => [t.id, t.name]));

  const rows: (string | number)[][] = [
    [
      "رتبه",
      "تیم",
      "فروش ناخالص",
      "سود پرداختی",
      "فروش خالص",
      "سرمایهٔ خارجی",
      "بازده سرمایه‌گذار (درصد)",
      "خریداران یکتا",
      "قلب‌ها",
      "کیفیت",
      "تیزر",
      "پرتفوی (خام)",
      "سلیقه (خام)",
      ...SCORE_CATEGORY_ORDER.map((k) => `امتیاز ${SCORE_CATEGORY_LABELS[k].label}`),
      "جریمهٔ خرج‌نشده",
      "امتیاز کل",
    ],
    ...[...output.teams]
      .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
      .map((t) => [
        t.rank ?? "",
        teamNames.get(t.teamId) ?? t.teamId,
        t.grossSales,
        t.dividendsPaid,
        t.netSales,
        t.externalCapital,
        Math.round(t.investorRoi * 1000) / 10,
        t.uniqueBuyers,
        t.hearts,
        t.quality,
        t.teaser,
        Math.round(t.portfolio * 10) / 10,
        Math.round(t.taste * 10) / 10,
        ...SCORE_CATEGORY_ORDER.map((k) => Math.round(t.pts[k] * 10) / 10),
        Math.round(t.unspentPenalty * 10) / 10,
        Math.round(t.total * 10) / 10,
      ]),
  ];
  return csvResponse(toCsv(rows), "team-scores.csv");
}
