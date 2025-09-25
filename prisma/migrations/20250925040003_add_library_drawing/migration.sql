-- CreateTable
CREATE TABLE "OperatingCost" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "year" INTEGER NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperatingCost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DrawingTemplate" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "infrastructure" TEXT NOT NULL,
    "drawingType" TEXT NOT NULL,
    "paramSchema" JSONB,
    "fileUrl" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "version" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DrawingTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeneratedDrawing" (
    "id" SERIAL NOT NULL,
    "templateId" INTEGER NOT NULL,
    "userId" INTEGER,
    "projectId" INTEGER,
    "parameters" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'generated',
    "error" TEXT,
    "outputUrl" TEXT NOT NULL,
    "outputMimeType" TEXT,
    "previewUrl" TEXT,
    "size" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "libraryItemId" INTEGER,

    CONSTRAINT "GeneratedDrawing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LibraryItem" (
    "id" SERIAL NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "infrastruktur" TEXT,
    "kapasitas" DOUBLE PRECISION,
    "unit" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "files" JSONB,
    "projectId" INTEGER,
    "generatedDrawingId" INTEGER,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LibraryItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GeneratedDrawing_libraryItemId_key" ON "GeneratedDrawing"("libraryItemId");

-- CreateIndex
CREATE UNIQUE INDEX "LibraryItem_generatedDrawingId_key" ON "LibraryItem"("generatedDrawingId");

-- AddForeignKey
ALTER TABLE "OperatingCost" ADD CONSTRAINT "OperatingCost_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrawingTemplate" ADD CONSTRAINT "DrawingTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedDrawing" ADD CONSTRAINT "GeneratedDrawing_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "DrawingTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedDrawing" ADD CONSTRAINT "GeneratedDrawing_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedDrawing" ADD CONSTRAINT "GeneratedDrawing_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryItem" ADD CONSTRAINT "LibraryItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryItem" ADD CONSTRAINT "LibraryItem_generatedDrawingId_fkey" FOREIGN KEY ("generatedDrawingId") REFERENCES "GeneratedDrawing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryItem" ADD CONSTRAINT "LibraryItem_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
