/*
  Warnings:

  - You are about to drop the `CCI` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE "CCI";

-- CreateTable
CREATE TABLE "cci" (
    "id" SERIAL NOT NULL,
    "kodeProvinsi" INTEGER NOT NULL,
    "provinsi" TEXT NOT NULL,
    "cci" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "cci_pkey" PRIMARY KEY ("id")
);
