const pool = require('./config/db');

(async () => {
  try {
    const conn = await pool.getConnection();
    
    // ดึงข้อมูล rewards และ users หลายตัว
    const rewards = await conn.query('SELECT reward_id, reward_name FROM rewards LIMIT 5');
    const users = await conn.query('SELECT user_id, phone_number FROM users LIMIT 5');
    
    if (!rewards.length || !users.length) {
      console.log('ไม่มี reward หรือ user ในระบบ');
      conn.release();
      process.exit(0);
    }
    
    let count = 0;
    const statuses = ['pending', 'used', 'pending', 'cancelled', 'pending'];
    
    // สร้าง redemption records หลายรายการ
    for (let i = 0; i < Math.min(5, rewards.length, users.length); i++) {
      const reward = rewards[i];
      const user = users[i];
      const status = statuses[i];
      
      const now = new Date();
      const expires = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      const redeemed = new Date(now.getTime() - Math.random() * 7 * 24 * 60 * 60 * 1000); // ย้อนหลัง 0-7 วัน
      
      await conn.query(
        'INSERT INTO reward_redemption_history (user_id, phone_number, reward_id, reward_name, points_redeemed, redemption_status, redeemed_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [user.user_id, user.phone_number, reward.reward_id, reward.reward_name, Math.floor(Math.random() * 500) + 50, status, redeemed, expires]
      );
      count++;
      console.log(`✓ เพิ่ม: ${user.phone_number} - ${reward.reward_name} (${status})`);
    }
    
    console.log(`\n✓ สร้างข้อมูลทดสอบ ${count} รายการสำเร็จ`);
    
    conn.release();
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
