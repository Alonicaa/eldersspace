-- Migration: เพิ่ม content และ redemption_id (FK) ในตาราง notifications
-- แทนที่จะเก็บ qr_code ซ้ำ ให้อ้างอิง redemption_id จาก reward_redemption_history โดยตรง

ALTER TABLE notifications
  ADD COLUMN `content`       LONGTEXT NULL DEFAULT NULL AFTER `type`,
  ADD COLUMN `redemption_id` INT(11)  NULL DEFAULT NULL AFTER `content`,
  ADD CONSTRAINT `fk_notif_redemption`
    FOREIGN KEY (`redemption_id`)
    REFERENCES `reward_redemption_history`(`redemption_id`)
    ON DELETE SET NULL;

-- Index สำหรับ query เร็ว
CREATE INDEX idx_notifications_type_created
  ON notifications(type, created_at DESC);

CREATE INDEX idx_notifications_redemption_id
  ON notifications(redemption_id);

-- ตรวจสอบผลลัพธ์
DESCRIBE notifications;
