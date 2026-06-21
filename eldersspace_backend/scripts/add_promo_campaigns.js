require('dotenv').config();
const pool = require('../config/db');

async function addPromoCampaigns() {
  let conn;
  try {
    conn = await pool.getConnection();

    // Create promo_campaigns table
    await conn.query(`
      CREATE TABLE IF NOT EXISTS promo_campaigns (
        campaign_id INT PRIMARY KEY AUTO_INCREMENT,
        reward_id INT NOT NULL,
        campaign_name VARCHAR(255) NOT NULL,
        campaign_start_date DATETIME NOT NULL,
        campaign_end_date DATETIME NOT NULL,
        description TEXT,
        is_active TINYINT DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (reward_id) REFERENCES rewards(reward_id),
        KEY idx_reward (reward_id),
        KEY idx_active (is_active),
        KEY idx_dates (campaign_start_date, campaign_end_date)
      )
    `);

    console.log('✅ promo_campaigns table created successfully');

    // Add campaign fields to promo_codes table
    // Add columns separately to avoid syntax issues
    try {
      await conn.query(`ALTER TABLE promo_codes ADD COLUMN campaign_id INT`);
    } catch (e) {
      if (e.code !== 'ER_DUP_FIELDNAME') throw e;
    }

    try {
      await conn.query(`ALTER TABLE promo_codes ADD COLUMN uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP`);
    } catch (e) {
      if (e.code !== 'ER_DUP_FIELDNAME') throw e;
    }

    try {
      await conn.query(`ALTER TABLE promo_codes ADD COLUMN batch_upload_id VARCHAR(50)`);
    } catch (e) {
      if (e.code !== 'ER_DUP_FIELDNAME') throw e;
    }

    // Add foreign key and indexes
    try {
      await conn.query(`ALTER TABLE promo_codes ADD CONSTRAINT fk_promo_campaign FOREIGN KEY (campaign_id) REFERENCES promo_campaigns(campaign_id)`);
    } catch (e) {
      if (e.code !== 'ER_DUP_KEYNAME') throw e;
    }

    try {
      await conn.query(`ALTER TABLE promo_codes ADD KEY idx_campaign (campaign_id)`);
    } catch (e) {
      if (e.code !== 'ER_DUP_KEYNAME') throw e;
    }

    try {
      await conn.query(`ALTER TABLE promo_codes ADD KEY idx_uploaded (uploaded_at)`);
    } catch (e) {
      if (e.code !== 'ER_DUP_KEYNAME') throw e;
    }

    try {
      await conn.query(`ALTER TABLE promo_codes ADD KEY idx_batch (batch_upload_id)`);
    } catch (e) {
      if (e.code !== 'ER_DUP_KEYNAME') throw e;
    }

    console.log('✅ Added campaign fields to promo_codes table');

    // Create promo_code_redemptions table for detailed tracking
    await conn.query(`
      CREATE TABLE IF NOT EXISTS promo_code_redemptions (
        redemption_id INT PRIMARY KEY AUTO_INCREMENT,
        promo_code_id INT NOT NULL,
        code VARCHAR(100),
        redeemed_by_user_id INT,
        redeemed_by_phone VARCHAR(20),
        redeemed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        reward_id INT,
        points_awarded INT,
        device_info TEXT,
        ip_address VARCHAR(45),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (promo_code_id) REFERENCES promo_codes(promo_code_id),
        KEY idx_code_id (promo_code_id),
        KEY idx_phone (redeemed_by_phone),
        KEY idx_redeemed_at (redeemed_at)
      )
    `);

    console.log('✅ promo_code_redemptions table created successfully');

    conn.release();
    console.log('\n✅ All migrations completed successfully');
  } catch (error) {
    console.error('❌ Error during migration:', error);
    if (conn) conn.release();
    process.exit(1);
  }
}

addPromoCampaigns().then(() => {
  console.log('Migration script finished');
  process.exit(0);
});
