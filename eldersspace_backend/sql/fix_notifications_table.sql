-- Fix notifications table to support reward_redemption notifications
-- Run this SQL to enable notifications for reward redemption feature

-- Step 1: Update type ENUM to include 'reward_redemption'
ALTER TABLE notifications 
MODIFY COLUMN type ENUM('like','comment','reply','follow','share','reward_redemption') NOT NULL;

-- Step 2: Add content column if it doesn't exist (for storing JSON data)
ALTER TABLE notifications
ADD COLUMN IF NOT EXISTS content LONGTEXT NULL AFTER type;

-- Step 3: Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_type_created ON notifications(type, created_at DESC);

-- Verify the changes
-- SELECT * FROM notifications LIMIT 5;
-- SELECT COLUMN_NAME, COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='notifications' AND TABLE_SCHEMA=DATABASE();
