/*
  Warnings:

  - You are about to drop the column `kapasitasRegasifikasi` on the `ConstructionCost` table. All the data in the column will be lost.
  - You are about to drop the column `satuanKapasitas` on the `ConstructionCost` table. All the data in the column will be lost.
  - You are about to drop the column `kapasitasRegasifikasi` on the `UnitPrice` table. All the data in the column will be lost.
  - You are about to drop the column `satuanKapasitas` on the `UnitPrice` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "ConstructionCost" DROP COLUMN "kapasitasRegasifikasi",
DROP COLUMN "satuanKapasitas";

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "inflasi" DOUBLE PRECISION DEFAULT 0;

-- AlterTable
ALTER TABLE "UnitPrice" DROP COLUMN "kapasitasRegasifikasi",
DROP COLUMN "satuanKapasitas";

-- AlterTable
ALTER TABLE "cci" ADD COLUMN     "delivery" DOUBLE PRECISION NOT NULL DEFAULT 0;
