const pool = require('../config/db');

async function main() {
  const phone = process.argv[2] || '0650479951';

  const conn = await pool.getConnection();
  try {
    const users = await conn.query(
      'SELECT user_id FROM users WHERE phone_number = ? LIMIT 1',
      [phone]
    );

    if (!users.length) {
      console.log(`No user found for phone ${phone}`);
      return;
    }

    await conn.query("UPDATE users SET role = 'admin' WHERE phone_number = ?", [phone]);

    const updated = await conn.query(
      'SELECT user_id, phone_number, full_name, role FROM users WHERE phone_number = ?',
      [phone]
    );

    console.log('Promoted admin user:', updated);
  } finally {
    conn.release();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
