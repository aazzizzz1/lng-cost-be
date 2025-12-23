/*
  Warnings:

  - The `cbmExposurePolicy` column on the `mooring_rule_settings` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "mooring_rule_settings" DROP COLUMN "cbmExposurePolicy",
ADD COLUMN     "cbmExposurePolicy" TEXT NOT NULL DEFAULT 'SHELTERED_SEMI';

-- DropEnum
DROP TYPE "CBMExposurePolicy";
