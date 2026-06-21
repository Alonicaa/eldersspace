const pool = require('./config/db');

(async () => {
  try {
    const conn = await pool.getConnection();
    
    // ดึง user ที่มีแต้มพอ
    const users = await conn.query('SELECT user_id, phone_number, total_points FROM users WHERE total_points >= 100 LIMIT 1');
    const rewards = await conn.query('SELECT reward_id, reward_name FROM rewards WHERE is_active = 1 LIMIT 1');
    
    if (!users.length || !rewards.length) {
      console.log('ไม่มี user หรือ reward');
      conn.release();
      process.exit(0);
    }
    
    const user = users[0];
    const reward = rewards[0];
    
    // สร้าง QR code
    const testCode = 'QR' + Date.now() + Math.random().toString(16).slice(2, 10).toUpperCase();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    
    await conn.query(
      'INSERT INTO qr_codes (code, user_id, reward_id, phone_number, points_redeemed, expires_at) VALUES (?, ?, ?, ?, 100, ?)',
      [testCode, user.user_id, reward.reward_id, user.phone_number, expiresAt]
    );
    
    const qrResult = await conn.query('SELECT qr_id FROM qr_codes WHERE code = ?', [testCode]);
    const qrId = qrResult[0].qr_id;
    
    // สร้าง redemption history
    await conn.query(
      'INSERT INTO reward_redemption_history (user_id, phone_number, reward_id, reward_name, points_redeemed, qr_code, redemption_status, redeemed_at, expires_at) VALUES (?, ?, ?, ?, 100, ?, ?, NOW(), ?)',
      [user.user_id, user.phone_number, reward.reward_id, reward.reward_name, testCode, 'pending', expiresAt]
    );
    
    conn.release();
    
    console.log('✓ Test data created successfully');
    console.log('  User:', user.phone_number, '(ID:', user.user_id + ')');
    console.log('  Reward:', reward.reward_name);
    console.log('  QR Code:', testCode);
    console.log('  QR ID:', qrId);
    
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
