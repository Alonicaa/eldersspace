const pool = require('../config/db');

(async () => {
  let conn;
  try {
    conn = await pool.getConnection();

    console.log('Updating notifications table schema...');

    // Add 'reply' and 'share' to ENUM
    await conn.query(`
      ALTER TABLE notifications 
      MODIFY COLUMN type ENUM('like','comment','reply','follow','share')
    `);

    console.log('✅ Schema updated successfully!');
    conn.release();
    process.exit(0);

  } catch (err) {
    console.error('❌ Error:', err.message);
    if (conn) conn.release();
    process.exit(1);
  }
})();
