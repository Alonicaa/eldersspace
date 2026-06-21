/**
 * Migration Script: Add streak_milestone_days column
 * This script adds the streak_milestone_days column to the reward_settings table
 * to allow admin configuration of consecutive login days needed for streak bonus.
 * 
 * Run: node scripts/add_streak_milestone_days.js
 */

const pool = require('../config/db');

async function addStreakMilestoneDays() {
  let conn;
  try {
    conn = await pool.getConnection();

    console.log('Checking reward_settings table structure...');
    const columns = await conn.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_NAME = 'reward_settings' AND TABLE_SCHEMA = DATABASE()`
    );

    const columnNames = columns.map(c => c.COLUMN_NAME);
    const hasStreakMilestoneDays = columnNames.includes('streak_milestone_days');

    if (hasStreakMilestoneDays) {
      console.log('✅ streak_milestone_days column already exists!');
      conn.release();
      process.exit(0);
      return;
    }

    console.log('Adding streak_milestone_days column...');
    await conn.query(`
      ALTER TABLE reward_settings
      ADD COLUMN streak_milestone_days INT DEFAULT 30 
      COMMENT 'วันที่ consecutive login เพื่อได้ streak milestone bonus'
      AFTER streak_milestone_bonus
    `);

    console.log('✅ streak_milestone_days column added successfully!');

    const settings = await conn.query(
      'SELECT streak_milestone_days FROM reward_settings WHERE setting_id = 1'
    );

    if (settings.length) {
      console.log(`Current default: ${settings[0].streak_milestone_days} days`);
    }

    conn.release();
    console.log('✅ Migration completed!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error adding column:', err.message);
    process.exit(1);
  } finally {
    if (conn) conn.release();
  }
}

addStreakMilestoneDays();
