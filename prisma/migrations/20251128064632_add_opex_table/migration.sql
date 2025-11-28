-- CreateTable
CREATE TABLE "Opex" (
    "id" SERIAL NOT NULL,
    "infrastructure" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "kategoriOpex" TEXT NOT NULL,
    "item" TEXT NOT NULL,
    "deskripsi" TEXT,
    "hargaOpex" DOUBLE PRECISION NOT NULL,
    "volume" DOUBLE PRECISION NOT NULL,
    "satuanVolume" TEXT NOT NULL,
    "tahun" INTEGER NOT NULL,
    "lokasi" TEXT NOT NULL,
    "project" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Opex_pkey" PRIMARY KEY ("id")
);
