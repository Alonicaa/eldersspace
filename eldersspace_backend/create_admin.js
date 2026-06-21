require('dotenv').config();
const pool = require('./config/db');

async function createAdminUser() {
  let conn;
  try {
    conn = await pool.getConnection();
    
    // Check if admin already exists
    const existing = await conn.query(
      `SELECT user_id FROM users WHERE phone_number = '0800000001' AND role = 'admin'`
    );
    
    if (existing.length > 0) {
      console.log('✓ Admin user already exists');
      conn.release();
      return;
    }
    
    // Create admin user (without password if column doesn't exist)
    const result = await conn.query(
      `INSERT INTO users (full_name, phone_number, role, is_verified)
       VALUES (?, ?, ?, ?)`,
      ['Admin User', '0800000001', 'admin', true]
    );
    
    // Try to update password if column exists
    try {
      await conn.query(
        `UPDATE users SET password = ? WHERE user_id = ?`,
        ['admin123456', result.insertId]
      );
    } catch (e) {
      console.log('  (password column not available)');
    }
    
    console.log('✓ Admin user created successfully');
    console.log('  Phone: 0800000001');
    console.log('  Password: admin123456');
    console.log('  User ID:', result.insertId);
    
    conn.release();
  } catch (err) {
    console.error('✗ Error creating admin user:', err.message);
    if (conn) conn.release();
    process.exit(1);
  }
}

createAdminUser().then(() => {
  console.log('\nDone. Server is ready.');
  process.exit(0);
});
