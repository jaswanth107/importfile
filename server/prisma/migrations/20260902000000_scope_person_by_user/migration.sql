-- Scope Person rows to their owning user.
-- AddColumn
ALTER TABLE "Person" ADD COLUMN "userId" TEXT;

-- Backfill: attribute existing people to the user whose import created them,
-- via the import run they were created by. Rows with no traceable import
-- (or an import with no user) are left unowned and are not returned to anyone.
UPDATE "Person" p
SET "userId" = ir."userId"
FROM "ImportRun" ir
WHERE p."createdByImportId" = ir.id
  AND ir."userId" IS NOT NULL;

-- DropIndex
DROP INDEX "Person_email_key";

-- CreateIndex
CREATE UNIQUE INDEX "Person_userId_email_key" ON "Person"("userId", "email");

-- CreateIndex
CREATE INDEX "Person_userId_idx" ON "Person"("userId");

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
