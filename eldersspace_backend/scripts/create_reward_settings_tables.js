/**
 * Script สำหรับสร้างตารางสำหรับระบบจัดการแต้ม
 * รัน: node scripts/create_reward_settings_tables.js
 */

const pool = require('../config/db');

async function createTables() {
  let conn;
  try {
    conn = await pool.getConnection();

    // 1. ตาราบันทึกการตั้งค่าแต้ม
    console.log('Creating reward_settings table...');
    await conn.query(`
      CREATE TABLE IF NOT EXISTS reward_settings (
        setting_id INT PRIMARY KEY AUTO_INCREMENT,
        points_per_minute DECIMAL(5, 2) DEFAULT 0.5 COMMENT 'แต้มต่อนาทีใช้งาน',
        session_bonus_threshold INT DEFAULT 40 COMMENT 'นาทีที่ใช้งานก่อนได้ bonus',
        session_bonus_points INT DEFAULT 8 COMMENT 'แต้ม bonus ต่อรอบ',
        usage_reward_daily_limit_count INT DEFAULT 2 COMMENT 'จำนวนรอบโบนัสเวลาใช้งานสูงสุดต่อวัน',
        daily_login_bonus INT DEFAULT 1 COMMENT 'แต้ม login reward ปกติ',
        daily_login_bonus_3x_threshold INT DEFAULT 30 COMMENT 'วันที่ streak ถึงเท่านี้ได้ 1.2x',
        daily_login_bonus_3x_multiplier DECIMAL(3, 2) DEFAULT 1.2 COMMENT 'ตัวคูณสำหรับ login bonus',
        streak_milestone_bonus INT DEFAULT 2 COMMENT 'โบนัสทุก 10 วัน streak',
        streak_milestone_days INT DEFAULT 30 COMMENT 'จำนวนวัน streak ที่รับโบนัส',
        profile_completion_points INT DEFAULT 50 COMMENT 'แต้มกรอกโปรไฟล์ครบ (ครั้งเดียว)',
        post_activity_points INT DEFAULT 10 COMMENT 'แต้มโพสต์ครบเงื่อนไข',
        post_activity_required_posts INT DEFAULT 2 COMMENT 'จำนวนโพสต์พร้อมรูปขั้นต่ำ/วัน',
        comment_activity_points INT DEFAULT 2 COMMENT 'แต้มต่อคอมเมนต์',
        comment_activity_daily_limit_count INT DEFAULT 5 COMMENT 'คอมเมนต์สูงสุดที่รับแต้ม/วัน',
        share_activity_points INT DEFAULT 10 COMMENT 'แต้มแชร์กิจกรรมต่อโพสต์ต้นฉบับ',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('✓ reward_settings created');

    // 2. ตารางจัดการอีเว้นแจกแต้ม
    console.log('Creating bonus_events table...');
    await conn.query(`
      CREATE TABLE IF NOT EXISTS bonus_events (
        event_id INT PRIMARY KEY AUTO_INCREMENT,
        event_name VARCHAR(100) NOT NULL COMMENT 'ชื่ออีเว้น เช่น "Bonus Login Hari Raya"',
        event_type VARCHAR(50) NOT NULL COMMENT 'ประเภท: login_bonus, usage_bonus, special_event',
        points_awarded INT NOT NULL COMMENT 'จำนวนแต้มที่แจก',
        description TEXT COMMENT 'รายละเอียดอีเว้น',
        start_date DATE NOT NULL COMMENT 'วันเริ่ม',
        end_date DATE NOT NULL COMMENT 'วันสิ้นสุด',
        is_active BOOLEAN DEFAULT TRUE COMMENT 'เปิด/ปิดอีเว้น',
        max_points_per_user INT COMMENT 'จำนวนแต้มสูงสุดต่อ user (NULL = ไม่มีขีด)',
        bonus_type ENUM('one_time', 'recurring_daily') DEFAULT 'one_time' COMMENT 'แบบครั้งเดียวหรือทุกวัน',
        created_by INT COMMENT 'admin id ที่สร้าง',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('✓ bonus_events created');

    // 3. ตารางบันทึกว่า user ได้ event bonus หรือไม่แล้ว
    console.log('Creating user_event_bonus table...');
    await conn.query(`
      CREATE TABLE IF NOT EXISTS user_event_bonus (
        record_id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT NOT NULL,
        event_id INT NOT NULL,
        points_awarded INT NOT NULL,
        awarded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unique_user_event (user_id, event_id),
        FOREIGN KEY (event_id) REFERENCES bonus_events(event_id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('✓ user_event_bonus created');

    // 4. Insert default settings
    console.log('Inserting default reward settings...');
    await conn.query(`
      INSERT IGNORE INTO reward_settings (setting_id, points_per_minute, session_bonus_threshold, session_bonus_points, usage_reward_daily_limit_count) 
      VALUES (1, 0.5, 40, 8, 2)
    `);
    await conn.query(`
      ALTER TABLE reward_settings
      ADD COLUMN IF NOT EXISTS usage_reward_daily_limit_count INT NOT NULL DEFAULT 2
      AFTER session_bonus_points
    `);
    console.log('✓ Default settings inserted');

    console.log('\n✅ All tables created successfully!');
  } catch (err) {
    console.error('❌ Error creating tables:', err.message);
    process.exit(1);
  } finally {
    if (conn) conn.release();
    process.exit(0);
  }
}

createTables();
