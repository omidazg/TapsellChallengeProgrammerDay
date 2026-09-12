import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { computeScores } from "@/lib/scoring";

const BOM = "﻿";

function csvCell(v: string | number): string {
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(rows: (string | number)[][]): string {
  return BOM + rows.map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
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
    const rows: (string | number)[][] = [
      ["id", "userId", "nickname", "teamId", "wallet", "delta", "reason", "refId", "createdAt"],
      ...entries.map((e) => [e.id, e.userId ?? "", e.user?.nickname ?? "", e.teamId ?? "", e.wallet, e.delta, e.reason, e.refId ?? "", e.createdAt.toISOString()]),
    ];
    return new NextResponse(toCsv(rows), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="ledger.csv"' },
    });
  }

  const output = await computeScores();
  const teams = await prisma.team.findMany({ select: { id: true, name: true, slug: true } });
  const teamNames = new Map(teams.map((t) => [t.id, t.name]));
  const rows: (string | number)[][] = [
    ["rank", "teamId", "teamName", "netSales", "externalCapital", "investorRoi", "quality", "teaser", "hearts", "unspentPenalty", "total"],
    ...[...output.teams]
      .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
      .map((t) => [
        t.rank ?? "",
        t.teamId,
        teamNames.get(t.teamId) ?? "",
        t.netSales,
        t.externalCapital,
        t.investorRoi,
        t.quality,
        t.teaser,
        t.hearts,
        t.unspentPenalty,
        t.total,
      ]),
  ];
  return new NextResponse(toCsv(rows), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="team-scores.csv"' },
  });
}
