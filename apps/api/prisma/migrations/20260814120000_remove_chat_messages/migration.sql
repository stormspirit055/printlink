-- The conversation module has been removed. Historical chat messages and
-- chat-generated notifications are intentionally deleted.
DELETE FROM "Notification" WHERE "type" = 'CHAT_MESSAGE';
DROP TABLE IF EXISTS "Message";
