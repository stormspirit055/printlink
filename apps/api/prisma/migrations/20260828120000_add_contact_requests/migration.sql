CREATE TYPE "ContactRequestStatus" AS ENUM ('PENDING', 'APPROVED');

ALTER TABLE "User" ADD COLUMN "wechatId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Notification" ADD COLUMN "demandId" TEXT;

CREATE TABLE "ContactRequest" (
  "id" TEXT NOT NULL,
  "demandId" TEXT NOT NULL,
  "requesterId" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "status" "ContactRequestStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "approvedAt" TIMESTAMP(3),
  CONSTRAINT "ContactRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ContactRequest_demandId_requesterId_key" ON "ContactRequest"("demandId", "requesterId");
CREATE INDEX "ContactRequest_ownerId_status_createdAt_idx" ON "ContactRequest"("ownerId", "status", "createdAt");
CREATE INDEX "Notification_demandId_idx" ON "Notification"("demandId");

ALTER TABLE "ContactRequest" ADD CONSTRAINT "ContactRequest_demandId_fkey" FOREIGN KEY ("demandId") REFERENCES "Demand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContactRequest" ADD CONSTRAINT "ContactRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContactRequest" ADD CONSTRAINT "ContactRequest_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_demandId_fkey" FOREIGN KEY ("demandId") REFERENCES "Demand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
