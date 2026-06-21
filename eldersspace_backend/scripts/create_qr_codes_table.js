const pool = require('../config/db');

async function createQRCodesTable() {
  const conn = await pool.getConnection();
  try {
    console.log('Creating qr_codes table...');
    
    await conn.query(`
      CREATE TABLE IF NOT EXISTS qr_codes (
        qr_id INT AUTO_INCREMENT PRIMARY KEY,
        code VARCHAR(255) UNIQUE NOT NULL,
        user_id INT NOT NULL,
        reward_id INT NOT NULL,
        phone_number VARCHAR(20),
        points_redeemed INT NOT NULL,
        is_used BOOLEAN DEFAULT FALSE,
        used_at TIMESTAMP NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
        FOREIGN KEY (reward_id) REFERENCES rewards(reward_id) ON DELETE CASCADE,
        INDEX idx_code (code),
        INDEX idx_user_id (user_id),
        INDEX idx_reward_id (reward_id),
        INDEX idx_is_used (is_used),
        INDEX idx_expires_at (expires_at),
        INDEX idx_phone (phone_number)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    
    console.log('✅ Successfully created qr_codes table');
    conn.release();
    process.exit(0);
  } catch (err) {
    console.error('❌ Error creating table:', err.message);
    conn.release();
    process.exit(1);
  }
}

createQRCodesTable();
