/*
  Warnings:

  - You are about to drop the column `jenis` on the `Project` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Project" DROP COLUMN "jenis",
ADD COLUMN     "infrastruktur" TEXT;
