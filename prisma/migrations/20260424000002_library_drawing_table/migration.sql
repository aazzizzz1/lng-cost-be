-- Drop the embedded drawings JSON column from InfraLibrary
ALTER TABLE "InfraLibrary" DROP COLUMN IF EXISTS "drawings";

-- Create InfraLibraryDrawing table
CREATE TABLE "InfraLibraryDrawing" (
    "id"        SERIAL NOT NULL,
    "libraryId" INTEGER NOT NULL,
    "drawKey"   TEXT NOT NULL,
    "title"     TEXT NOT NULL,
    "imageUrl"  TEXT,
    "fileName"  TEXT,
    "mimeType"  TEXT,
    "order"     INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InfraLibraryDrawing_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InfraLibraryDrawing_libraryId_drawKey_key"
    ON "InfraLibraryDrawing"("libraryId", "drawKey");

CREATE INDEX "InfraLibraryDrawing_libraryId_idx"
    ON "InfraLibraryDrawing"("libraryId");

ALTER TABLE "InfraLibraryDrawing"
    ADD CONSTRAINT "InfraLibraryDrawing_libraryId_fkey"
    FOREIGN KEY ("libraryId") REFERENCES "InfraLibrary"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
