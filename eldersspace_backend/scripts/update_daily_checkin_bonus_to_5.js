/**
 * Migration Script: Update daily_login_bonus from 1 to 5
 * This script updates existing reward_settings records to use the new default
 * daily check-in bonus of 5 points instead of 1 point.
 * 
 * Run: node scripts/update_daily_checkin_bonus_to_5.js
 */

const pool = require('../config/db');

async function updateDailyCheckinBonus() {
  let conn;
  try {
    conn = await pool.getConnection();

    console.log('Checking current reward_settings...');
    const current = await conn.query(
      'SELECT setting_id, daily_login_bonus FROM reward_settings WHERE setting_id = 1'
    );

    if (!current.length) {
      console.log('⚠️  reward_settings table not found or empty!');
      console.log('Please run: node scripts/create_reward_settings_tables.js first');
      conn.release();
      return;
    }

    const currentBonus = Number(current[0].daily_login_bonus);
    console.log(`Current daily_login_bonus: ${currentBonus}`);

    if (currentBonus === 5) {
      console.log('✅ Already set to 5. No changes needed.');
      conn.release();
      process.exit(0);
      return;
    }

    console.log('Updating daily_login_bonus to 5...');
    await conn.query(
      'UPDATE reward_settings SET daily_login_bonus = 5 WHERE setting_id = 1'
    );

    const updated = await conn.query(
      'SELECT daily_login_bonus FROM reward_settings WHERE setting_id = 1'
    );

    const newBonus = Number(updated[0].daily_login_bonus);
    console.log(`✅ Updated successfully! New daily_login_bonus: ${newBonus}`);

    conn.release();
    process.exit(0);
  } catch (err) {
    console.error('❌ Error updating daily_login_bonus:', err.message);
    if (conn) conn.release();
    process.exit(1);
  }
}

updateDailyCheckinBonus();
