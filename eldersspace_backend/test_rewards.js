const pool = require('./config/db');

(async () => {
  try {
    const conn = await pool.getConnection();
    const rewards = await conn.query('SELECT * FROM rewards LIMIT 5');
    console.log('Rewards count:', rewards.length);
    if (rewards.length > 0) {
      console.log('Sample reward:', rewards[0]);
    } else {
      console.log('No rewards found - table is empty');
    }
    conn.release();
  } catch (err) {
    console.error('Error:', err.message);
  }
  process.exit(0);
})();
