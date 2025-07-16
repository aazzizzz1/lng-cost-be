-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "volume" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "CCI" (
    "id" SERIAL NOT NULL,
    "kodeProvinsi" INTEGER NOT NULL,
    "provinsi" TEXT NOT NULL,
    "cci" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "CCI_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CCI_kodeProvinsi_key" ON "CCI"("kodeProvinsi");
