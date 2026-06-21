-- Migration: Add FCM device token to users for push notifications
-- Note: MySQL does not support IF NOT EXISTS for ALTER TABLE / CREATE INDEX.
-- Run once only. Re-running will error if column/index already exists (safe to ignore).
ALTER TABLE users ADD COLUMN fcm_token VARCHAR(500) DEFAULT NULL;
CREATE INDEX idx_users_fcm_token ON users(fcm_token(255));
