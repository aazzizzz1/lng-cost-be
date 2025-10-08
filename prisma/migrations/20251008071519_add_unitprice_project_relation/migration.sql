-- AlterTable
ALTER TABLE "UnitPrice" ADD COLUMN     "projectId" INTEGER;

-- AddForeignKey
ALTER TABLE "UnitPrice" ADD CONSTRAINT "UnitPrice_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
