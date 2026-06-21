# SQL Migration Guide - Reward Notification System

## ภาพรวม
เพื่อให้ระบบแลกแต้มและ notification สมบูรณ์ ต้องเพิ่ม columns ลงใน `notifications` table เพื่อเก็บข้อมูล reward redemption

## ขั้นตอนการติดตั้ง

### ตัวเลือก 1: Notifications Table ยังไม่มี (Fresh Install)
ถ้าไม่เคยสร้าง notifications table เลย ให้รัน:

```bash
# เปิด MySQL client แล้วรัน
mysql> source /path/to/eldersspace_backend/sql/create_notifications_table.sql;
```

**ไฟล์:** `sql/create_notifications_table.sql`

---

### ตัวเลือก 2: Notifications Table มีอยู่แล้ว (Existing Database)
ถ้ามี notifications table แล้วแต่ขาด columns สำหรับ reward data ให้รัน:

```bash
# เปิด MySQL client แล้วรัน
mysql> source /path/to/eldersspace_backend/sql/add_reward_notification_support.sql;
```

**ไฟล์:** `sql/add_reward_notification_support.sql`

---

## SQL Statements เพื่อรันด้วยมือ

### ตัวเลือก A: สร้าง Notifications Table ใหม่
```sql
CREATE TABLE IF NOT EXISTS notifications (
  notification_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  actor_id INT NOT NULL,
  post_id INT NULL,
  type ENUM('like','comment','reply','follow','share','reward_redemption') NOT NULL DEFAULT 'like',
  content LONGTEXT NULL DEFAULT NULL COMMENT 'JSON data for reward notifications',
  reward_name VARCHAR(255) NULL DEFAULT NULL,
  qr_code VARCHAR(255) NULL DEFAULT NULL,
  is_read TINYINT(1) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_user_id (user_id),
  INDEX idx_actor_id (actor_id),
  INDEX idx_post_id (post_id),
  INDEX idx_type (type),
  INDEX idx_notifications_type_created (type, created_at DESC),
  INDEX idx_is_read (is_read),
  
  CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  CONSTRAINT fk_notifications_actor FOREIGN KEY (actor_id) REFERENCES users(user_id) ON DELETE CASCADE,
  CONSTRAINT fk_notifications_post FOREIGN KEY (post_id) REFERENCES posts(post_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### ตัวเลือก B: เพิ่ม Columns ไปยัง Existing Table
```sql
-- เพิ่ม columns สำหรับ reward notification
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS `content` LONGTEXT NULL DEFAULT NULL AFTER `type`,
  ADD COLUMN IF NOT EXISTS `reward_name` VARCHAR(255) NULL DEFAULT NULL AFTER `content`,
  ADD COLUMN IF NOT EXISTS `qr_code` VARCHAR(255) NULL DEFAULT NULL AFTER `reward_name`;

-- อัปเดต type enum ให้รวม reward_redemption
ALTER TABLE notifications 
  MODIFY COLUMN type ENUM('like','comment','reply','follow','share','reward_redemption') NOT NULL;

-- สร้าง indexes
CREATE INDEX IF NOT EXISTS idx_notifications_type_created 
  ON notifications(type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_reward_name 
  ON notifications(reward_name);
CREATE INDEX IF NOT EXISTS idx_notifications_qr_code 
  ON notifications(qr_code);
```

---

## ตรวจสอบการติดตั้ง

```sql
-- ตรวจสอบ table structure
DESCRIBE notifications;

-- ตรวจสอบ columns สำคัญ
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_KEY, COLUMN_COMMENT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'notifications' AND TABLE_SCHEMA = DATABASE();

-- ตรวจสอบ reward notifications
SELECT * FROM notifications 
WHERE type = 'reward_redemption' 
ORDER BY created_at DESC 
LIMIT 10;

-- ตรวจสอบ data ใน notifications
SELECT notification_id, user_id, type, reward_name, qr_code, created_at 
FROM notifications 
WHERE type = 'reward_redemption' 
LIMIT 5;
```

---

## ข้อมูลที่จะบันทึก

เมื่อแลกแต้ม ระบบจะบันทึก:

```json
{
  "notification_id": 123,
  "user_id": 456,
  "actor_id": 456,
  "type": "reward_redemption",
  "reward_name": "กาแฟ 1 แก้ว",
  "qr_code": "LT_1714041234567_abc123",
  "content": "{\"reward_name\": \"กาแฟ 1 แก้ว\", \"qr_code\": \"LT_1714041234567_abc123\", \"expires_at\": \"2026-04-24T12:34:56\", \"points_used\": 50}",
  "created_at": "2026-04-24T10:34:56"
}
```

---

## Troubleshooting

### ปัญหา: "Error 1064" หรือ Syntax Error
- ตรวจสอบว่า SQL statements ไม่มี Thai characters ใน comments
- ลองตัด comments ออก

### ปัญหา: "Table doesn't exist"
- ให้แน่ใจว่ากำลัง select database ที่ถูกต้อง
- รัน `SHOW TABLES;` เพื่อดูว่ามี notifications table หรือไม่

### ปัญหา: "Duplicate key name"
- Index อาจถูกสร้างแล้ว ใช้ `IF NOT EXISTS` ก่อน

---

## ไฟล์ที่เกี่ยวข้อง

- **Backend Route:** `eldersspace_backend/routes/notifications.js`
- **Controller:** `eldersspace_backend/controllers/notificationController.js`
- **Frontend:** `eldersspace/lib/notification_page.dart`
- **Migration Files:** 
  - `sql/create_notifications_table.sql`
  - `sql/add_reward_notification_support.sql`
