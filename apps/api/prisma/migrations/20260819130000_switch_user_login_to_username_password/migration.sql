-- Switch user login from phone+OTP to username+password.
-- username is backfilled from the existing (unique) phone so current accounts
-- keep a loginable identifier; passwordHash stays nullable because argon2
-- hashes cannot be generated in SQL and register/seed always set it. phone
-- becomes optional (unique index preserved) so existing data is not lost.
ALTER TABLE "User" ADD COLUMN "username" TEXT;
ALTER TABLE "User" ADD COLUMN "passwordHash" TEXT;
UPDATE "User" SET "username" = "phone";
ALTER TABLE "User" ALTER COLUMN "username" SET NOT NULL;
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
ALTER TABLE "User" ALTER COLUMN "phone" DROP NOT NULL;
