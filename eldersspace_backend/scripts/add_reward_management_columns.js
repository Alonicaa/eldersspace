/**
 * Migration Script: Add reward management columns
 * Adds stock and user_limit columns to rewards table for tracking inventory and limits
 * Run once: node eldersspace_backend/scripts/add_reward_management_columns.js
 */

const pool = require('../config/db');

async function migrateRewardColumns() {
  let conn;
  try {
    conn = await pool.getConnection();

    console.log('Starting reward management columns migration...');

    // Check and add stock column
    const stockCheck = await conn.query(
      `SELECT COUNT(*) as total FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rewards' 
       AND COLUMN_NAME = 'stock'`
    );

    if (Number(stockCheck[0]?.total || 0) === 0) {
      console.log('✓ Adding stock column to rewards table...');
      await conn.query(
        'ALTER TABLE rewards ADD COLUMN stock INT DEFAULT 0 AFTER is_active'
      );
      console.log('✓ stock column added');
    } else {
      console.log('✓ stock column already exists');
    }

    // Check and add user_limit column
    const userLimitCheck = await conn.query(
      `SELECT COUNT(*) as total FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rewards' 
       AND COLUMN_NAME = 'user_limit'`
    );

    if (Number(userLimitCheck[0]?.total || 0) === 0) {
      console.log('✓ Adding user_limit column to rewards table...');
      await conn.query(
        'ALTER TABLE rewards ADD COLUMN user_limit INT DEFAULT -1 AFTER stock'
      );
      console.log('✓ user_limit column added');
    } else {
      console.log('✓ user_limit column already exists');
    }

    // Verify columns exist
    const finalCheck = await conn.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rewards'
       ORDER BY ORDINAL_POSITION`
    );

    console.log('\n✓ Rewards table columns:');
    finalCheck.forEach(col => console.log(`  - ${col.COLUMN_NAME}`));

    console.log('\n✅ Migration completed successfully!');
    
    conn.release();
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    if (conn) conn.release();
    process.exit(1);
  }
}

migrateRewardColumns();
