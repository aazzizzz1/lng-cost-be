-- Drop old split tables (cascade handles FK constraints)
DROP TABLE IF EXISTS "InfraLibraryDrawing";
DROP TABLE IF EXISTS "InfraLibraryItem";
DROP TABLE IF EXISTS "InfraLibraryCategory";

-- Create unified table
CREATE TABLE "InfraLibrary" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "categoryName" TEXT NOT NULL,
    "description" TEXT,
    "variantKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "params" JSONB NOT NULL,
    "drawings" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InfraLibrary_pkey" PRIMARY KEY ("id")
);

-- Unique constraint on (code, variantKey)
CREATE UNIQUE INDEX "InfraLibrary_code_variantKey_key" ON "InfraLibrary"("code", "variantKey");

-- Index for filtering by code
CREATE INDEX "InfraLibrary_code_idx" ON "InfraLibrary"("code");
