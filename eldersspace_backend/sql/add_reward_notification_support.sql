-- ============================================
-- Migration: Add Reward Notification Support
-- ============================================
-- เพิ่ม columns สำหรับเก็บข้อมูล reward notification ลงใน notifications table
-- ใช้ content (JSON) + reward_name และ qr_code สำหรับ query เร็ว

-- Step 1: เพิ่ม columns ที่ขาดหายไป
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS `content` LONGTEXT NULL DEFAULT NULL COMMENT 'JSON data for notifications' AFTER `type`,
  ADD COLUMN IF NOT EXISTS `reward_name` VARCHAR(255) NULL DEFAULT NULL AFTER `content`,
  ADD COLUMN IF NOT EXISTS `qr_code` VARCHAR(255) NULL DEFAULT NULL AFTER `reward_name`;

-- Step 2: อัปเดต ENUM type ให้รวม reward_redemption
-- หลังจาก ALTER ให้ตรวจสอบ type enum แล้วอัปเดตถ้าจำเป็น
ALTER TABLE notifications 
  MODIFY COLUMN type ENUM('like','comment','reply','follow','share','reward_redemption') NOT NULL;

-- Step 3: สร้าง Index สำหรับการค้นหาเร็ว
CREATE INDEX IF NOT EXISTS idx_notifications_type_created 
  ON notifications(type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_reward_name 
  ON notifications(reward_name);

CREATE INDEX IF NOT EXISTS idx_notifications_qr_code 
  ON notifications(qr_code);

-- ============================================
-- Verification
-- ============================================
-- ตรวจสอบ table structure
-- DESCRIBE notifications;

-- ตรวจสอบ reward notifications
-- SELECT * FROM notifications WHERE type = 'reward_redemption' ORDER BY created_at DESC LIMIT 10;

-- ตรวจสอบจำนวน notification
-- SELECT COUNT(*) as total_notifications FROM notifications;
-- SELECT type, COUNT(*) as count FROM notifications GROUP BY type;
