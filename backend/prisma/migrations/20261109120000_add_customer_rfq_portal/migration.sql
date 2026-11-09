ALTER TYPE "Role" ADD VALUE 'CUSTOMER';

ALTER TABLE "users"
ADD COLUMN "assignedSalespersonId" TEXT;

CREATE INDEX "users_assignedSalespersonId_idx" ON "users"("assignedSalespersonId");

ALTER TABLE "users"
ADD CONSTRAINT "users_assignedSalespersonId_fkey"
FOREIGN KEY ("assignedSalespersonId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;