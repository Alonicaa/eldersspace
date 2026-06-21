-- ============================================
-- URGENT FIX: Add reward_redemption to notifications table
-- ============================================
-- Run this immediately to fix notification creation error

-- Step 1: Update the type ENUM to include reward_redemption
ALTER TABLE notifications 
MODIFY COLUMN type ENUM('like','comment','reply','follow','share','reward_redemption') NOT NULL;

-- Step 2: Add missing content column if it doesn't exist
ALTER TABLE notifications
ADD COLUMN IF NOT EXISTS content LONGTEXT NULL DEFAULT NULL AFTER type;

-- Step 3: Add optional columns for easier queries
ALTER TABLE notifications
ADD COLUMN IF NOT EXISTS reward_name VARCHAR(255) NULL DEFAULT NULL AFTER content,
ADD COLUMN IF NOT EXISTS qr_code VARCHAR(255) NULL DEFAULT NULL AFTER reward_name;

-- Step 4: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_type_created ON notifications(type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reward_name ON notifications(reward_name);
CREATE INDEX IF NOT EXISTS idx_qr_code ON notifications(qr_code);

-- Verify the changes
DESCRIBE notifications;
SELECT * FROM notifications WHERE type = 'reward_redemption' LIMIT 5;
