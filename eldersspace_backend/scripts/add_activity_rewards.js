/**
 * Migration: Add Activity-Based Reward Tracking
 * - Profile Completion: +50 points (one-time)
 * - Verified Account: +5 points
 * - Post Activity: +10 points (for 2 posts every 2 days, max 2/day)
 * - Comment Activity: +2 points per comment (max 5/day)
 * - Profile Rewards: +10 points
 */

const pool = require('../config/db');

async function ensureActivityRewardColumnsInUsers(conn) {
  console.log('Checking for activity reward columns in users table...');

  const columns = await conn.query(`
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'
  `);

  const colSet = new Set(columns.map(c => c.COLUMN_NAME));

  const columnsToAdd = [
    {
      name: 'profile_completion_rewarded',
      def: 'profile_completion_rewarded BOOLEAN DEFAULT FALSE'
    },
    {
      name: 'verified_account_rewarded',
      def: 'verified_account_rewarded BOOLEAN DEFAULT FALSE'
    },
  ];

  for (const col of columnsToAdd) {
    if (!colSet.has(col.name)) {
      console.log(`  Adding ${col.name}...`);
      await conn.query(`ALTER TABLE users ADD COLUMN ${col.def}`);
    }
  }
}

async function ensureActivityRewardTables(conn) {
  console.log('Ensuring activity reward tracking tables exist...');

  // Post activity rewards table
  await conn.query(`
    CREATE TABLE IF NOT EXISTS post_activity_rewards (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      phone_number VARCHAR(20),
      reward_date DATE NOT NULL,
      post_count INT DEFAULT 0,
      points_awarded INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
      UNIQUE KEY unique_user_date (user_id, reward_date),
      INDEX idx_phone (phone_number),
      INDEX idx_date (reward_date)
    )
  `);

  // Comment activity rewards table
  await conn.query(`
    CREATE TABLE IF NOT EXISTS comment_activity_rewards (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      phone_number VARCHAR(20),
      reward_date DATE NOT NULL,
      comment_count INT DEFAULT 0,
      points_awarded INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
      UNIQUE KEY unique_user_date (user_id, reward_date),
      INDEX idx_phone (phone_number),
      INDEX idx_date (reward_date)
    )
  `);

  // Share activity rewards table (1 reward per original post)
  await conn.query(`
    CREATE TABLE IF NOT EXISTS share_activity_rewards (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      phone_number VARCHAR(20),
      reward_date DATE NOT NULL,
      shared_post_id INT NOT NULL,
      points_awarded INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
      FOREIGN KEY (shared_post_id) REFERENCES posts(post_id) ON DELETE CASCADE,
      UNIQUE KEY unique_user_shared_post (user_id, shared_post_id),
      INDEX idx_share_phone (phone_number),
      INDEX idx_share_date (reward_date)
    )
  `);

  // Profile/Account rewards table
  await conn.query(`
    CREATE TABLE IF NOT EXISTS account_milestone_rewards (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      phone_number VARCHAR(20),
      milestone_type VARCHAR(50) NOT NULL,
      points_awarded INT DEFAULT 0,
      rewarded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
      UNIQUE KEY unique_milestone (user_id, milestone_type),
      INDEX idx_phone (phone_number),
      INDEX idx_type (milestone_type)
    )
  `);
}

async function ensurePointsTransactionsSourceTypes(conn) {
  console.log('Ensuring points_transactions source_type values support new types...');
  // This is just for documentation - the source_type field is already VARCHAR
  // We can use: 'post_activity', 'comment_activity', 'profile_completion', 'verified_account', 'profile_milestone'
}

async function run() {
  const conn = await pool.getConnection();
  try {
    console.log('\n=== Starting Activity Rewards Migration ===\n');

    await ensureActivityRewardColumnsInUsers(conn);
    await ensureActivityRewardTables(conn);
    await ensurePointsTransactionsSourceTypes(conn);

    console.log('\n✓ Migration completed successfully!\n');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    conn.release();
  }
}

run();
