-- بازطراحی ساده: یک کیف سکه، خرید سکه با پول، امتیاز سه‌معیاره، داوری سه‌پرسشی،
-- کسر امتیاز تقلب و انتشار روی بازار استودیو.
-- AddColumns (plain ALTER TABLE keeps live data in place; no table rebuild)
ALTER TABLE "Team" ADD COLUMN "cheatPenalty" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Team" ADD COLUMN "cheatNote" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Team" ADD COLUMN "solo" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Product" ADD COLUMN "juryWorks" INTEGER;
ALTER TABLE "Product" ADD COLUMN "juryValue" INTEGER;
ALTER TABLE "Product" ADD COLUMN "juryPitch" INTEGER;
ALTER TABLE "Product" ADD COLUMN "liveStatus" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Product" ADD COLUMN "liveSourceUrl" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Product" ADD COLUMN "liveRequestNote" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Product" ADD COLUMN "liveUrl" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Product" ADD COLUMN "liveAdminNote" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Product" ADD COLUMN "liveRequestedAt" DATETIME;
ALTER TABLE "Product" ADD COLUMN "liveAt" DATETIME;
ALTER TABLE "TeamScore" ADD COLUMN "memberCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "TeamScore" ADD COLUMN "juryRaw" REAL;
ALTER TABLE "TeamScore" ADD COLUMN "juryAdjusted" REAL NOT NULL DEFAULT 0;
ALTER TABLE "TeamScore" ADD COLUMN "people" REAL NOT NULL DEFAULT 0;
ALTER TABLE "TeamScore" ADD COLUMN "supporters" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "TeamScore" ADD COLUMN "coinsReceived" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "TeamScore" ADD COLUMN "ai" REAL;
ALTER TABLE "TeamScore" ADD COLUMN "ptsJury" REAL NOT NULL DEFAULT 0;
ALTER TABLE "TeamScore" ADD COLUMN "ptsPeople" REAL NOT NULL DEFAULT 0;
ALTER TABLE "TeamScore" ADD COLUMN "ptsAi" REAL NOT NULL DEFAULT 0;
ALTER TABLE "TeamScore" ADD COLUMN "cheatPenalty" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "CoinOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "coins" INTEGER NOT NULL,
    "amountRial" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "gateway" TEXT NOT NULL,
    "authority" TEXT,
    "refId" TEXT,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" DATETIME,
    CONSTRAINT "CoinOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CoinOrder_gateway_authority_key" ON "CoinOrder"("gateway", "authority");
CREATE INDEX "CoinOrder_userId_createdAt_idx" ON "CoinOrder"("userId", "createdAt");
CREATE INDEX "CoinOrder_status_idx" ON "CoinOrder"("status");

-- یک کیف سکه: موجودی کیف بذر قدیمی به کیف سکه منتقل می‌شود.
UPDATE "User" SET "buyWallet" = "buyWallet" + "seedWallet", "seedWallet" = 0 WHERE "seedWallet" > 0;
-- فاز «حراج زنده» حذف شده و حراج داخل روز بازار است.
UPDATE "Setting" SET "value" = 'MARKET' WHERE "key" = 'phase' AND "value" = 'AUCTION';
