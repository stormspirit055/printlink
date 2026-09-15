BEGIN;

ALTER TABLE "User" ADD COLUMN "avatarKey" TEXT;

-- Match the relation actions declared by the current Prisma schema.
ALTER TABLE "User" DROP CONSTRAINT "User_invitationCodeId_fkey";
ALTER TABLE "User" ADD CONSTRAINT "User_invitationCodeId_fkey"
  FOREIGN KEY ("invitationCodeId") REFERENCES "InvitationCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InvitationCode" DROP CONSTRAINT "InvitationCode_createdById_fkey";
ALTER TABLE "InvitationCode" ADD CONSTRAINT "InvitationCode_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
