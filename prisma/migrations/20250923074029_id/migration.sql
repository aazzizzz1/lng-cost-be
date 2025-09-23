/*
  Warnings:

  - You are about to drop the column `projectId` on the `UnitPrice` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "UnitPrice" DROP CONSTRAINT "UnitPrice_projectId_fkey";

-- AlterTable
ALTER TABLE "UnitPrice" DROP COLUMN "projectId";
