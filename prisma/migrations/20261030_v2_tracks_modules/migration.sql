-- AlterTable
ALTER TABLE "AdSlot" ADD COLUMN "winnerProductId" TEXT;
ALTER TABLE "AdSlot" ADD COLUMN "winnerUserId" TEXT;

-- CreateTable
CREATE TABLE "Track" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL DEFAULT 'PRODUCT',
    "category" TEXT NOT NULL DEFAULT 'MIXED',
    "status" TEXT NOT NULL DEFAULT 'open',
    "order" INTEGER NOT NULL DEFAULT 0,
    "weights" TEXT NOT NULL DEFAULT '{}',
    "juryCriteria" TEXT NOT NULL DEFAULT '[]',
    "aiRubric" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "OsIssue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "url" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ModuleException" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "moduleKey" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "IdeaRevision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ideaId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "oneLiner" TEXT NOT NULL,
    "problem" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "buildPlan" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IdeaRevision_ideaId_fkey" FOREIGN KEY ("ideaId") REFERENCES "Idea" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "JuryScore" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "judgeId" TEXT NOT NULL,
    "scores" TEXT NOT NULL DEFAULT '{}',
    "note" TEXT NOT NULL DEFAULT '',
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "JuryScore_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "JuryScore_judgeId_fkey" FOREIGN KEY ("judgeId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BazaarStat" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "activeInstalls" INTEGER NOT NULL DEFAULT 0,
    "revenueToman" INTEGER NOT NULL DEFAULT 0,
    "rating" REAL,
    "commentCount" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "flagNote" TEXT NOT NULL DEFAULT '',
    "snapshotAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BazaarStat_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Prize" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trackId" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL DEFAULT 'RANK',
    "rank" INTEGER NOT NULL DEFAULT 1,
    "label" TEXT NOT NULL,
    "emoji" TEXT NOT NULL DEFAULT '🏆',
    "amountToman" INTEGER,
    "winnerProductId" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Prize_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Seed: default tracks and first-place prizes (amounts are entered by the admin before launch)
INSERT INTO "Track" ("id", "name", "description", "kind", "category", "status", "order", "weights") VALUES
  ('general', 'محور عمومی', 'ساخت محصول و انتشار روی بازار', 'PRODUCT', 'MIXED', 'open', 0, '{"ai": 30, "market": 30, "jury": 40, "marketSub": {"support": 20, "activeInstalls": 33, "revenue": 24, "rating": 14, "comments": 9}}'),
  ('content', 'تولید محتوا', 'ویدیو، پادکست، دوره، فیلم، موسیقی یا هر راهکار محتوایی', 'CONTENT', 'NON_TECH', 'open', 1, '{"ai": 42, "market": 6, "jury": 52, "marketSub": {"support": 100, "activeInstalls": 0, "revenue": 0, "rating": 0, "comments": 0}}'),
  ('os', 'راهکار OS', 'راهکار برای مسائل تیم OS', 'OS', 'TECH', 'hidden', 2, '{"ai": 42, "market": 6, "jury": 52, "marketSub": {"support": 100, "activeInstalls": 0, "revenue": 0, "rating": 0, "comments": 0}}');
INSERT INTO "Prize" ("id", "trackId", "category", "kind", "rank", "label", "emoji", "order") VALUES
  ('prize-general-tech', 'general', 'TECH', 'RANK', 1, 'نفر اول ساخت محصول (فنی)', '🏆', 1),
  ('prize-general-nontech', 'general', 'NON_TECH', 'RANK', 1, 'نفر اول ساخت محصول (غیرفنی)', '🏆', 2),
  ('prize-content', 'content', '', 'RANK', 1, 'نفر اول تولید محتوا', '🎬', 3),
  ('prize-os', 'os', '', 'RANK', 1, 'نفر اول راهکار OS', '🧩', 4);

-- Phases are gone: only LIVE and CLOSED remain
UPDATE "Setting" SET "value" = 'LIVE' WHERE "key" = 'phase' AND "value" <> 'CLOSED';

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "power" TEXT NOT NULL,
    "powerUsed" BOOLEAN NOT NULL DEFAULT false,
    "shieldTeamId" TEXT,
    "coffee" INTEGER NOT NULL DEFAULT 5,
    "bugs" INTEGER NOT NULL DEFAULT 50,
    "sleep" INTEGER NOT NULL DEFAULT 7,
    "confidence" INTEGER NOT NULL DEFAULT 100,
    "avatarSeed" TEXT NOT NULL DEFAULT '',
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "staffRole" TEXT NOT NULL DEFAULT '',
    "department" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sessionVersion" INTEGER NOT NULL DEFAULT 0,
    "blockedAt" DATETIME,
    "teamId" TEXT,
    "seedWallet" INTEGER NOT NULL DEFAULT 100,
    "buyWallet" INTEGER NOT NULL DEFAULT 100,
    CONSTRAINT "User_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_User" ("avatarSeed", "blockedAt", "bugs", "buyWallet", "coffee", "confidence", "createdAt", "department", "email", "id", "isAdmin", "nickname", "passwordHash", "phone", "power", "powerUsed", "role", "seedWallet", "sessionVersion", "shieldTeamId", "sleep", "teamId") SELECT "avatarSeed", "blockedAt", "bugs", "buyWallet", "coffee", "confidence", "createdAt", "department", "email", "id", "isAdmin", "nickname", "passwordHash", "phone", "power", "powerUsed", "role", "seedWallet", "sessionVersion", "shieldTeamId", "sleep", "teamId" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");
CREATE INDEX "User_teamId_idx" ON "User"("teamId");
CREATE TABLE "new_Idea" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "teamId" TEXT NOT NULL,
    "trackId" TEXT NOT NULL DEFAULT 'general',
    "title" TEXT NOT NULL,
    "oneLiner" TEXT NOT NULL,
    "problem" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "buildPlan" TEXT NOT NULL,
    "coverUrl" TEXT NOT NULL DEFAULT '',
    "fundingCap" INTEGER NOT NULL,
    "revenueShare" INTEGER NOT NULL,
    "analystClarity" INTEGER,
    "analystFeasibility" INTEGER,
    "analystNovelty" INTEGER,
    "analystSummary" TEXT,
    "analystAdvice" TEXT,
    "editedAt" DATETIME,
    "submittedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Idea_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Idea_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Idea" ("analystClarity", "analystFeasibility", "analystNovelty", "analystSummary", "audience", "buildPlan", "coverUrl", "createdAt", "fundingCap", "id", "oneLiner", "problem", "revenueShare", "submittedAt", "teamId", "title", "updatedAt") SELECT "analystClarity", "analystFeasibility", "analystNovelty", "analystSummary", "audience", "buildPlan", "coverUrl", "createdAt", "fundingCap", "id", "oneLiner", "problem", "revenueShare", "submittedAt", "teamId", "title", "updatedAt" FROM "Idea";
DROP TABLE "Idea";
ALTER TABLE "new_Idea" RENAME TO "Idea";
CREATE INDEX "Idea_trackId_idx" ON "Idea"("trackId");
CREATE UNIQUE INDEX "Idea_teamId_trackId_key" ON "Idea"("teamId", "trackId");
CREATE TABLE "new_Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "trackId" TEXT NOT NULL DEFAULT 'general',
    "category" TEXT NOT NULL DEFAULT '',
    "deliverableUrl" TEXT NOT NULL DEFAULT '',
    "contentType" TEXT NOT NULL DEFAULT '',
    "osIssueId" TEXT,
    "preExistingNote" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "tagline" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "demoUrl" TEXT NOT NULL DEFAULT '',
    "teaserUrl" TEXT NOT NULL DEFAULT '',
    "images" TEXT NOT NULL DEFAULT '[]',
    "price" INTEGER NOT NULL DEFAULT 20,
    "specialName" TEXT NOT NULL DEFAULT '',
    "specialDesc" TEXT NOT NULL DEFAULT '',
    "specialStart" INTEGER NOT NULL DEFAULT 20,
    "submittedAt" DATETIME,
    "aiQuality" INTEGER,
    "aiNotes" TEXT,
    "aiRecheckUsed" BOOLEAN NOT NULL DEFAULT false,
    "aiFinal" INTEGER,
    "aiFinalNotes" TEXT,
    "aiFinalDetail" TEXT NOT NULL DEFAULT '',
    "bazaarPackage" TEXT NOT NULL DEFAULT '',
    "liveStatus" TEXT NOT NULL DEFAULT '',
    "liveSourceUrl" TEXT NOT NULL DEFAULT '',
    "liveRequestNote" TEXT NOT NULL DEFAULT '',
    "liveUrl" TEXT NOT NULL DEFAULT '',
    "liveAdminNote" TEXT NOT NULL DEFAULT '',
    "liveRequestedAt" DATETIME,
    "liveAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Product_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Product_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Product_osIssueId_fkey" FOREIGN KEY ("osIssueId") REFERENCES "OsIssue" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Product" ("slug", "aiNotes", "aiQuality", "createdAt", "demoUrl", "description", "id", "images", "liveAdminNote", "liveAt", "liveRequestNote", "liveRequestedAt", "liveSourceUrl", "liveStatus", "liveUrl", "name", "price", "specialDesc", "specialName", "specialStart", "submittedAt", "tagline", "teamId", "teaserUrl", "updatedAt") SELECT (SELECT "slug" FROM "Team" WHERE "Team"."id" = "Product"."teamId") || '-general', "aiNotes", "aiQuality", "createdAt", "demoUrl", "description", "id", "images", "liveAdminNote", "liveAt", "liveRequestNote", "liveRequestedAt", "liveSourceUrl", "liveStatus", "liveUrl", "name", "price", "specialDesc", "specialName", "specialStart", "submittedAt", "tagline", "teamId", "teaserUrl", "updatedAt" FROM "Product";
DROP TABLE "Product";
ALTER TABLE "new_Product" RENAME TO "Product";
CREATE UNIQUE INDEX "Product_slug_key" ON "Product"("slug");
CREATE INDEX "Product_trackId_idx" ON "Product"("trackId");
CREATE UNIQUE INDEX "Product_teamId_trackId_key" ON "Product"("teamId", "trackId");
CREATE TABLE "new_AdSlotBid" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slotId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AdSlotBid_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "AdSlot" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AdSlotBid_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
-- Old fixed-price hourly slots have no product; bidding starts fresh (no real data yet)
DROP TABLE "AdSlotBid";
ALTER TABLE "new_AdSlotBid" RENAME TO "AdSlotBid";
DELETE FROM "AdSlot";
CREATE INDEX "AdSlotBid_slotId_amount_idx" ON "AdSlotBid"("slotId", "amount");
CREATE INDEX "AdSlotBid_teamId_idx" ON "AdSlotBid"("teamId");
CREATE TABLE "new_TeamScore" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "teamId" TEXT NOT NULL,
    "trackId" TEXT NOT NULL DEFAULT 'general',
    "productId" TEXT,
    "category" TEXT NOT NULL DEFAULT '',
    "overallRank" INTEGER NOT NULL DEFAULT 0,
    "ptsMarket" REAL NOT NULL DEFAULT 0,
    "marketDetail" TEXT NOT NULL DEFAULT '{}',
    "grossSales" INTEGER NOT NULL DEFAULT 0,
    "dividendsPaid" INTEGER NOT NULL DEFAULT 0,
    "netSales" INTEGER NOT NULL DEFAULT 0,
    "externalCapital" INTEGER NOT NULL DEFAULT 0,
    "investorRoi" REAL NOT NULL DEFAULT 0,
    "uniqueBuyers" INTEGER NOT NULL DEFAULT 0,
    "hearts" INTEGER NOT NULL DEFAULT 0,
    "unspentPenalty" REAL NOT NULL DEFAULT 0,
    "ptsSales" REAL NOT NULL DEFAULT 0,
    "ptsCapital" REAL NOT NULL DEFAULT 0,
    "ptsRoi" REAL NOT NULL DEFAULT 0,
    "ptsQuality" REAL NOT NULL DEFAULT 0,
    "ptsTeaser" REAL NOT NULL DEFAULT 0,
    "ptsCommunity" REAL NOT NULL DEFAULT 0,
    "ptsPortfolio" REAL NOT NULL DEFAULT 0,
    "ptsTaste" REAL NOT NULL DEFAULT 0,
    "total" REAL NOT NULL DEFAULT 0,
    "rank" INTEGER NOT NULL DEFAULT 0,
    "selfCapital" INTEGER NOT NULL DEFAULT 0,
    "quality" REAL NOT NULL DEFAULT 0,
    "teaser" REAL NOT NULL DEFAULT 0,
    "portfolio" INTEGER NOT NULL DEFAULT 0,
    "taste" REAL NOT NULL DEFAULT 0,
    "memberCount" INTEGER NOT NULL DEFAULT 0,
    "juryRaw" REAL,
    "juryAdjusted" REAL NOT NULL DEFAULT 0,
    "people" REAL NOT NULL DEFAULT 0,
    "supporters" INTEGER NOT NULL DEFAULT 0,
    "coinsReceived" INTEGER NOT NULL DEFAULT 0,
    "ai" REAL,
    "ptsJury" REAL NOT NULL DEFAULT 0,
    "ptsPeople" REAL NOT NULL DEFAULT 0,
    "ptsAi" REAL NOT NULL DEFAULT 0,
    "cheatPenalty" INTEGER NOT NULL DEFAULT 0,
    "computedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TeamScore_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TeamScore_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_TeamScore" ("ai", "cheatPenalty", "coinsReceived", "computedAt", "dividendsPaid", "externalCapital", "grossSales", "hearts", "id", "investorRoi", "juryAdjusted", "juryRaw", "memberCount", "netSales", "people", "portfolio", "ptsAi", "ptsCapital", "ptsCommunity", "ptsJury", "ptsPeople", "ptsPortfolio", "ptsQuality", "ptsRoi", "ptsSales", "ptsTaste", "ptsTeaser", "quality", "rank", "selfCapital", "supporters", "taste", "teamId", "teaser", "total", "uniqueBuyers", "unspentPenalty") SELECT "ai", "cheatPenalty", "coinsReceived", "computedAt", "dividendsPaid", "externalCapital", "grossSales", "hearts", "id", "investorRoi", "juryAdjusted", "juryRaw", "memberCount", "netSales", "people", "portfolio", "ptsAi", "ptsCapital", "ptsCommunity", "ptsJury", "ptsPeople", "ptsPortfolio", "ptsQuality", "ptsRoi", "ptsSales", "ptsTaste", "ptsTeaser", "quality", "rank", "selfCapital", "supporters", "taste", "teamId", "teaser", "total", "uniqueBuyers", "unspentPenalty" FROM "TeamScore";
DROP TABLE "TeamScore";
ALTER TABLE "new_TeamScore" RENAME TO "TeamScore";
CREATE UNIQUE INDEX "TeamScore_teamId_trackId_key" ON "TeamScore"("teamId", "trackId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "ModuleException_teamId_idx" ON "ModuleException"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "ModuleException_moduleKey_teamId_key" ON "ModuleException"("moduleKey", "teamId");

-- CreateIndex
CREATE INDEX "IdeaRevision_ideaId_idx" ON "IdeaRevision"("ideaId");

-- CreateIndex
CREATE INDEX "JuryScore_judgeId_idx" ON "JuryScore"("judgeId");

-- CreateIndex
CREATE UNIQUE INDEX "JuryScore_productId_judgeId_key" ON "JuryScore"("productId", "judgeId");

-- CreateIndex
CREATE UNIQUE INDEX "BazaarStat_productId_key" ON "BazaarStat"("productId");

-- CreateIndex
CREATE INDEX "Prize_trackId_idx" ON "Prize"("trackId");

