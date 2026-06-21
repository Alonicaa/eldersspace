// Migration script to create QR logs and redemption history tables
const pool = require('../config/db');
require('dotenv').config();

async function createQRLogsTables() {
  let conn;
  try {
    conn = await pool.getConnection();

    console.log('✓ Connected to database');

    // Create QR Code Logs Table (without FK to qr_codes if it doesn't exist)
    const qrLogsTable = `
      CREATE TABLE IF NOT EXISTS qr_code_logs (
        log_id INT AUTO_INCREMENT PRIMARY KEY,
        qr_id INT,
        qr_code VARCHAR(255) NOT NULL,
        user_id INT NOT NULL,
        phone_number VARCHAR(20) NOT NULL,
        action VARCHAR(50) NOT NULL,
        status VARCHAR(50),
        error_message TEXT,
        ip_address VARCHAR(45),
        user_agent TEXT,
        scanned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
        INDEX idx_qr_code (qr_code),
        INDEX idx_qr_id (qr_id),
        INDEX idx_user_id (user_id),
        INDEX idx_action (action),
        INDEX idx_scanned_at (scanned_at),
        INDEX idx_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `;

    await conn.query(qrLogsTable);
    console.log('✓ Created table: qr_code_logs');

    // Create Reward Redemption History Table
    const redemptionHistoryTable = `
      CREATE TABLE IF NOT EXISTS reward_redemption_history (
        redemption_id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        phone_number VARCHAR(20) NOT NULL,
        reward_id INT NOT NULL,
        reward_name VARCHAR(255),
        points_redeemed INT NOT NULL,
        qr_code VARCHAR(255) UNIQUE,
        redemption_status VARCHAR(50) NOT NULL DEFAULT 'pending',
        redeemed_at TIMESTAMP,
        scanned_at TIMESTAMP NULL,
        used_at TIMESTAMP NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
        FOREIGN KEY (reward_id) REFERENCES rewards(reward_id) ON DELETE CASCADE,
        INDEX idx_user_phone (user_id, phone_number),
        INDEX idx_reward_id (reward_id),
        INDEX idx_qr_code (qr_code),
        INDEX idx_status (redemption_status),
        INDEX idx_redeemed_at (redeemed_at),
        INDEX idx_expires_at (expires_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `;

    await conn.query(redemptionHistoryTable);
    console.log('✓ Created table: reward_redemption_history');

    console.log('\n✅ All tables created successfully!');
    console.log('\nTable Summary:');
    console.log('  1. qr_code_logs - Tracks all QR code scan/verify actions');
    console.log('  2. reward_redemption_history - Complete redemption lifecycle');

    conn.release();
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

// Run migration
createQRLogsTables();
