-- AddColumns (plain ALTER TABLE keeps live data in place; no table rebuild)
ALTER TABLE "TeamScore" ADD COLUMN "ptsPortfolio" REAL NOT NULL DEFAULT 0;
ALTER TABLE "TeamScore" ADD COLUMN "ptsTaste" REAL NOT NULL DEFAULT 0;
ALTER TABLE "TeamScore" ADD COLUMN "portfolio" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "TeamScore" ADD COLUMN "taste" REAL NOT NULL DEFAULT 0;
