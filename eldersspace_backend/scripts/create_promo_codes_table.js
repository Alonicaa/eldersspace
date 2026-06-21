require('dotenv').config();
const pool = require('../config/db');

async function createPromoCodesTable() {
  let conn;
  try {
    conn = await pool.getConnection();

    // Create promo_codes table
    await conn.query(`
      CREATE TABLE IF NOT EXISTS promo_codes (
        promo_code_id INT PRIMARY KEY AUTO_INCREMENT,
        code VARCHAR(100) NOT NULL UNIQUE,
        reward_id INT NOT NULL,
        description TEXT,
        expiry_date DATETIME,
        is_used TINYINT DEFAULT 0,
        used_by_user_id INT,
        used_by_phone VARCHAR(20),
        used_at DATETIME,
        redeemed_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (reward_id) REFERENCES rewards(reward_id),
        KEY idx_code (code),
        KEY idx_reward (reward_id),
        KEY idx_status (is_used),
        KEY idx_expiry (expiry_date)
      )
    `);

    console.log('✅ promo_codes table created successfully');

    // Create promo_code_logs table for audit trail
    await conn.query(`
      CREATE TABLE IF NOT EXISTS promo_code_logs (
        log_id INT PRIMARY KEY AUTO_INCREMENT,
        promo_code_id INT NOT NULL,
        code VARCHAR(100),
        action VARCHAR(50),
        user_id INT,
        phone_number VARCHAR(20),
        status VARCHAR(50),
        details JSON,
        ip_address VARCHAR(45),
        user_agent TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (promo_code_id) REFERENCES promo_codes(promo_code_id),
        KEY idx_code_id (promo_code_id),
        KEY idx_action (action),
        KEY idx_created (created_at)
      )
    `);

    console.log('✅ promo_code_logs table created successfully');

    conn.release();
  } catch (error) {
    console.error('❌ Error creating tables:', error);
    if (conn) conn.release();
    process.exit(1);
  }
}

createPromoCodesTable().then(() => {
  console.log('Migration completed successfully');
  process.exit(0);
});
