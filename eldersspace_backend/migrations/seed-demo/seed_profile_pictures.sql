-- =====================================================================
-- EldersSpace: เติมรูปโปรไฟล์แบบสุ่มให้บัญชีที่ยังไม่มีรูป
-- ใช้ Picsum Photos (https://picsum.photos) แบบ seed คงที่ต่อ user_id
-- เพื่อให้ URL เสถียรและไม่ซ้ำกันระหว่างผู้ใช้
-- =====================================================================

UPDATE users
SET profile_picture = 'https://picsum.photos/seed/es-user-' || user_id || '/400/400'
WHERE profile_picture IS NULL OR profile_picture = '';

SELECT COUNT(*) AS still_missing
FROM users
WHERE profile_picture IS NULL OR profile_picture = '';
