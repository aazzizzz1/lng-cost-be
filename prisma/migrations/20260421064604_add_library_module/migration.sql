-- CreateTable
CREATE TABLE "LibraryCatalog" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LibraryCatalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LibraryVariant" (
    "id" SERIAL NOT NULL,
    "catalogId" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "capacity" DOUBLE PRECISION NOT NULL,
    "capacityUnit" TEXT NOT NULL DEFAULT 'm3',
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LibraryVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LibraryParameter" (
    "id" SERIAL NOT NULL,
    "variantId" INTEGER NOT NULL,
    "groupName" TEXT NOT NULL,
    "groupOrder" INTEGER NOT NULL DEFAULT 0,
    "paramKey" TEXT NOT NULL,
    "paramLabel" TEXT NOT NULL,
    "baseValue" TEXT NOT NULL,
    "allowInterpolation" BOOLEAN NOT NULL DEFAULT false,
    "paramOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LibraryParameter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LibraryParameterValue" (
    "id" SERIAL NOT NULL,
    "parameterId" INTEGER NOT NULL,
    "capacity" DOUBLE PRECISION NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LibraryParameterValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LibraryDrawing" (
    "id" SERIAL NOT NULL,
    "variantId" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT NOT NULL,
    "imageData" BYTEA,
    "mimeType" TEXT NOT NULL DEFAULT 'image/jpeg',
    "fileSize" INTEGER,
    "uploadedBy" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LibraryDrawing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LibraryCatalog_name_key" ON "LibraryCatalog"("name");

-- CreateIndex
CREATE UNIQUE INDEX "LibraryVariant_catalogId_key_key" ON "LibraryVariant"("catalogId", "key");

-- CreateIndex
CREATE INDEX "LibraryVariant_catalogId_capacity_idx" ON "LibraryVariant"("catalogId", "capacity");

-- CreateIndex
CREATE UNIQUE INDEX "LibraryParameter_variantId_groupName_paramKey_key" ON "LibraryParameter"("variantId", "groupName", "paramKey");

-- CreateIndex
CREATE INDEX "LibraryParameter_variantId_groupName_idx" ON "LibraryParameter"("variantId", "groupName");

-- CreateIndex
CREATE UNIQUE INDEX "LibraryParameterValue_parameterId_capacity_key" ON "LibraryParameterValue"("parameterId", "capacity");

-- CreateIndex
CREATE INDEX "LibraryParameterValue_parameterId_capacity_idx" ON "LibraryParameterValue"("parameterId", "capacity");

-- CreateIndex
CREATE UNIQUE INDEX "LibraryDrawing_variantId_key_key" ON "LibraryDrawing"("variantId", "key");

-- CreateIndex
CREATE INDEX "LibraryDrawing_variantId_isActive_idx" ON "LibraryDrawing"("variantId", "isActive");

-- AddForeignKey
ALTER TABLE "LibraryVariant" ADD CONSTRAINT "LibraryVariant_catalogId_fkey" FOREIGN KEY ("catalogId") REFERENCES "LibraryCatalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryParameter" ADD CONSTRAINT "LibraryParameter_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "LibraryVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryParameterValue" ADD CONSTRAINT "LibraryParameterValue_parameterId_fkey" FOREIGN KEY ("parameterId") REFERENCES "LibraryParameter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryDrawing" ADD CONSTRAINT "LibraryDrawing_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "LibraryVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
