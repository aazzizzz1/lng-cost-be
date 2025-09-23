/*
  Warnings:

  - Made the column `workcode` on table `ConstructionCost` required. This step will fail if there are existing NULL values in that column.
  - Made the column `workcode` on table `UnitPrice` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "ConstructionCost" ALTER COLUMN "workcode" SET NOT NULL;

-- AlterTable
ALTER TABLE "UnitPrice" ADD COLUMN     "projectId" INTEGER,
ALTER COLUMN "workcode" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "UnitPrice" ADD CONSTRAINT "UnitPrice_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
