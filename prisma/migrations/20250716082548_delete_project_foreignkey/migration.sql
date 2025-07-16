-- DropForeignKey
ALTER TABLE "ConstructionCost" DROP CONSTRAINT "ConstructionCost_projectId_fkey";

-- AddForeignKey
ALTER TABLE "ConstructionCost" ADD CONSTRAINT "ConstructionCost_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
