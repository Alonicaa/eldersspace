const pool = require('./config/db');

(async () => {
  try {
    const conn = await pool.getConnection();
    const countResult = await conn.query('SELECT COUNT(*) as total FROM rewards');
    const total = Number(countResult[0]?.total || 0);
    
    const rewards = await conn.query(
      `SELECT reward_id, reward_name, required_points, description, image_url, category, 
              expiry_date, is_active, created_at, updated_at
       FROM rewards
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [20, 0]
    );
    
    console.log('Total:', total);
    console.log('Fetched:', rewards.length);
    if (rewards.length > 0) {
      console.log('First reward:', JSON.stringify(rewards[0], null, 2));
    }
    
    conn.release();
  } catch (err) {
    console.error('Error:', err.message);
    console.error(err);
  }
  process.exit(0);
})();
