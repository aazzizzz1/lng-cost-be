-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'user',
    "refreshToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "jenis" TEXT NOT NULL,
    "kategori" TEXT NOT NULL,
    "lokasi" TEXT NOT NULL,
    "tahun" INTEGER NOT NULL,
    "levelAACE" INTEGER NOT NULL,
    "harga" DOUBLE PRECISION NOT NULL,
    "satuan" TEXT,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConstructionCost" (
    "id" SERIAL NOT NULL,
    "uraian" TEXT NOT NULL,
    "specification" TEXT,
    "qty" DOUBLE PRECISION NOT NULL,
    "satuan" TEXT NOT NULL,
    "hargaSatuan" DOUBLE PRECISION NOT NULL,
    "totalHarga" DOUBLE PRECISION NOT NULL,
    "aaceClass" INTEGER NOT NULL,
    "accuracyLow" INTEGER NOT NULL,
    "accuracyHigh" INTEGER NOT NULL,
    "tahun" INTEGER NOT NULL,
    "infrastruktur" TEXT NOT NULL,
    "volume" DOUBLE PRECISION NOT NULL,
    "satuanVolume" TEXT NOT NULL,
    "kapasitasRegasifikasi" DOUBLE PRECISION NOT NULL,
    "satuanKapasitas" TEXT NOT NULL,
    "kelompok" TEXT NOT NULL,
    "kelompokDetail" TEXT NOT NULL,
    "lokasi" TEXT NOT NULL,
    "tipe" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "projectId" INTEGER NOT NULL,

    CONSTRAINT "ConstructionCost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnitPrice" (
    "id" SERIAL NOT NULL,
    "uraian" TEXT NOT NULL,
    "specification" TEXT,
    "qty" DOUBLE PRECISION NOT NULL,
    "satuan" TEXT NOT NULL,
    "hargaSatuan" DOUBLE PRECISION NOT NULL,
    "totalHarga" DOUBLE PRECISION NOT NULL,
    "aaceClass" INTEGER NOT NULL,
    "accuracyLow" INTEGER NOT NULL,
    "accuracyHigh" INTEGER NOT NULL,
    "tahun" INTEGER NOT NULL,
    "infrastruktur" TEXT NOT NULL,
    "volume" DOUBLE PRECISION NOT NULL,
    "satuanVolume" TEXT NOT NULL,
    "kapasitasRegasifikasi" DOUBLE PRECISION NOT NULL,
    "satuanKapasitas" TEXT NOT NULL,
    "kelompok" TEXT NOT NULL,
    "kelompokDetail" TEXT NOT NULL,
    "proyek" TEXT NOT NULL,
    "lokasi" TEXT NOT NULL,
    "tipe" TEXT NOT NULL,
    "kategori" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UnitPrice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- AddForeignKey
ALTER TABLE "ConstructionCost" ADD CONSTRAINT "ConstructionCost_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
