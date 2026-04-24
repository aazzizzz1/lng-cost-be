-- CreateTable
CREATE TABLE "InfraLibraryCategory" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InfraLibraryCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InfraLibraryItem" (
    "id" SERIAL NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "variantKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "params" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InfraLibraryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InfraLibraryDrawing" (
    "id" SERIAL NOT NULL,
    "itemId" INTEGER NOT NULL,
    "drawKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "imageUrl" TEXT,
    "fileName" TEXT,
    "mimeType" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InfraLibraryDrawing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InfraLibraryCategory_code_key" ON "InfraLibraryCategory"("code");

-- CreateIndex
CREATE INDEX "InfraLibraryItem_categoryId_idx" ON "InfraLibraryItem"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "InfraLibraryItem_categoryId_variantKey_key" ON "InfraLibraryItem"("categoryId", "variantKey");

-- CreateIndex
CREATE INDEX "InfraLibraryDrawing_itemId_idx" ON "InfraLibraryDrawing"("itemId");

-- AddForeignKey
ALTER TABLE "InfraLibraryItem" ADD CONSTRAINT "InfraLibraryItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "InfraLibraryCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InfraLibraryDrawing" ADD CONSTRAINT "InfraLibraryDrawing_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InfraLibraryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
