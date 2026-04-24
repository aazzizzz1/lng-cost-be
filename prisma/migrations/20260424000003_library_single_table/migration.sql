-- Drop the relational drawings table
DROP TABLE IF EXISTS "InfraLibraryDrawing";

-- Add drawings JSONB column back to InfraLibrary (default empty array)
ALTER TABLE "InfraLibrary"
    ADD COLUMN IF NOT EXISTS "drawings" JSONB NOT NULL DEFAULT '[]';
