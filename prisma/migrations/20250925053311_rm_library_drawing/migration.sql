/*
  Warnings:

  - You are about to drop the `DrawingTemplate` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `GeneratedDrawing` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `LibraryItem` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `OperatingCost` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "DrawingTemplate" DROP CONSTRAINT "DrawingTemplate_createdById_fkey";

-- DropForeignKey
ALTER TABLE "GeneratedDrawing" DROP CONSTRAINT "GeneratedDrawing_projectId_fkey";

-- DropForeignKey
ALTER TABLE "GeneratedDrawing" DROP CONSTRAINT "GeneratedDrawing_templateId_fkey";

-- DropForeignKey
ALTER TABLE "GeneratedDrawing" DROP CONSTRAINT "GeneratedDrawing_userId_fkey";

-- DropForeignKey
ALTER TABLE "LibraryItem" DROP CONSTRAINT "LibraryItem_createdById_fkey";

-- DropForeignKey
ALTER TABLE "LibraryItem" DROP CONSTRAINT "LibraryItem_generatedDrawingId_fkey";

-- DropForeignKey
ALTER TABLE "LibraryItem" DROP CONSTRAINT "LibraryItem_projectId_fkey";

-- DropForeignKey
ALTER TABLE "OperatingCost" DROP CONSTRAINT "OperatingCost_projectId_fkey";

-- DropTable
DROP TABLE "DrawingTemplate";

-- DropTable
DROP TABLE "GeneratedDrawing";

-- DropTable
DROP TABLE "LibraryItem";

-- DropTable
DROP TABLE "OperatingCost";
