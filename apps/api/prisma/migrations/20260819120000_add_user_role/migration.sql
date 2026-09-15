-- Add the USER role value ahead of collapsing BUYER/MAKER into USER.
-- PG16 allows ADD VALUE inside a transaction as long as the new value is not
-- used within the same transaction; the conversion + enum rebuild happen in
-- the next migration, so this stays safe.
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'USER';
