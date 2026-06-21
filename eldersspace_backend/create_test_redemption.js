const pool = require('./config/db');

(async () => {
  try {
    const conn = await pool.getConnection();
    
    // ดึงข้อมูล reward และ user ตัวแรก
    const rewards = await conn.query('SELECT reward_id, reward_name FROM rewards LIMIT 1');
    const users = await conn.query('SELECT user_id, phone_number FROM users LIMIT 1');
    
    if (!rewards.length || !users.length) {
      console.log('ไม่มี reward หรือ user ในระบบ');
      conn.release();
      process.exit(0);
    }
    
    const reward = rewards[0];
    const user = users[0];
    
    // สร้าง redemption record ทดสอบ
    const now = new Date();
    const expires = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    
    await conn.query(
      'INSERT INTO reward_redemption_history (user_id, phone_number, reward_id, reward_name, points_redeemed, redemption_status, redeemed_at, expires_at) VALUES (?, ?, ?, ?, 100, ?, NOW(), ?)',
      [user.user_id, user.phone_number, reward.reward_id, reward.reward_name, 'pending', expires]
    );
    
    console.log('✓ สร้าง redemption record ทดสอบสำเร็จ');
    console.log('  User:', user.phone_number);
    console.log('  Reward:', reward.reward_name);
    
    conn.release();
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
