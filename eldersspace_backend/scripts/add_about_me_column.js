const pool = require('../config/db.js');

async function addAboutMeColumn() {
  try {
    const conn = await pool.getConnection();
    
    // Check if column exists
    const result = await conn.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_NAME = 'users' AND COLUMN_NAME = 'about_me' AND TABLE_SCHEMA = DATABASE()`
    );
    
    if (result.length === 0) {
      // Add column if it doesn't exist
      await conn.query(
        `ALTER TABLE users ADD COLUMN about_me VARCHAR(500) DEFAULT NULL`
      );
      console.log('✅ about_me column added successfully');
    } else {
      console.log('ℹ️ about_me column already exists');
    }
    
    conn.release();
  } catch (err) {
    console.error('❌ Error:', err.message);
  }
  
  process.exit(0);
}

addAboutMeColumn();
