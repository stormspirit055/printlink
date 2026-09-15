-- Collapse BUYER/MAKER into USER and rebuild the enum to {ADMIN, USER}.
UPDATE "User" SET "role" = 'USER' WHERE "role" IN ('BUYER', 'MAKER');
ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TYPE "UserRole" RENAME TO "UserRole_old";
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'USER');
ALTER TABLE "User" ALTER COLUMN "role" TYPE "UserRole" USING ("role"::text)::"UserRole";
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'USER';
DROP TYPE "UserRole_old";

-- Invitation codes for invitation-based registration.
CREATE TABLE "InvitationCode" (
    "id"          TEXT              NOT NULL,
    "code"        TEXT              NOT NULL,
    "createdById" TEXT              NOT NULL,
    "maxUses"     INTEGER           NOT NULL,
    "usedCount"   INTEGER           NOT NULL DEFAULT 0,
    "expiresAt"   TIMESTAMP(3),
    "disabled"    BOOLEAN           NOT NULL DEFAULT false,
    "createdAt"   TIMESTAMP(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvitationCode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InvitationCode_code_key" ON "InvitationCode"("code");
CREATE INDEX "InvitationCode_createdById_createdAt_idx" ON "InvitationCode"("createdById", "createdAt");

ALTER TABLE "InvitationCode"
  ADD CONSTRAINT "InvitationCode_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id");

-- Link redeemers to the invitation code they used.
ALTER TABLE "User" ADD COLUMN "invitationCodeId" TEXT;
ALTER TABLE "User"
  ADD CONSTRAINT "User_invitationCodeId_fkey" FOREIGN KEY ("invitationCodeId") REFERENCES "InvitationCode"("id");
