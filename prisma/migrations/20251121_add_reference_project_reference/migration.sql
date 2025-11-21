ALTER TABLE "ConstructionCost"
  ADD COLUMN "referenceProjectId" INTEGER,
  ADD COLUMN "referenceProjectName" TEXT;

-- Foreign key with ON DELETE SET NULL to preserve estimating project rows
ALTER TABLE "ConstructionCost"
  ADD CONSTRAINT "ConstructionCost_referenceProjectId_fkey"
  FOREIGN KEY ("referenceProjectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Optional index to speed filtering by source project
CREATE INDEX IF NOT EXISTS "idx_constructioncost_referenceProjectId"
  ON "ConstructionCost"("referenceProjectId");
