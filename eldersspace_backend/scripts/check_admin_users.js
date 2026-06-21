const pool = require('../config/db');

async function main() {
  const conn = await pool.getConnection();
  try {
    const rows = await conn.query(
      'SELECT user_id, phone_number, full_name, role FROM users ORDER BY user_id ASC LIMIT 50'
    );
    console.log(rows);
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
