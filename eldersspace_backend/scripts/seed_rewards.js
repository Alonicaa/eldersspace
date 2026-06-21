const pool = require('../config/db');

async function getRewardColumns(conn) {
  const rows = await conn.query(
    `SELECT COLUMN_NAME
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = 'rewards'`
  );

  return new Set(rows.map((row) => row.COLUMN_NAME));
}

async function main() {
  const conn = await pool.getConnection();
  try {
    const countRows = await conn.query('SELECT COUNT(*) AS n FROM rewards');
    const count = Number(countRows[0].n || 0);
    const columns = await getRewardColumns(conn);

    if (count === 0) {
      const insertColumns = ['reward_name'];
      if (columns.has('points_required')) insertColumns.push('points_required');
      if (columns.has('required_points')) insertColumns.push('required_points');
      if (columns.has('expiry_date')) insertColumns.push('expiry_date');

      const rewards = [
        ['Pharmacy Discount 50', 20, 'DATE_ADD(CURDATE(), INTERVAL 90 DAY)'],
        ['Basic Health Check', 35, 'DATE_ADD(CURDATE(), INTERVAL 120 DAY)'],
        ['Senior Care Kit', 60, 'DATE_ADD(CURDATE(), INTERVAL 180 DAY)'],
        ['Online Exercise Course', 80, 'DATE_ADD(CURDATE(), INTERVAL 180 DAY)'],
        ['Medical Discount 100', 120, 'DATE_ADD(CURDATE(), INTERVAL 365 DAY)']
      ];

      const valuesSql = rewards
        .map((reward) => {
          const valueParts = [
            conn.escape(reward[0])
          ];

          if (columns.has('points_required')) valueParts.push(String(reward[1]));
          if (columns.has('required_points')) valueParts.push(String(reward[1]));
          if (columns.has('expiry_date')) valueParts.push(reward[2]);

          return `(${valueParts.join(', ')})`;
        })
        .join(',\n          ');

      await conn.query(`
        INSERT INTO rewards (${insertColumns.join(', ')})
        VALUES
          ${valuesSql}
      `);
      console.log('Seeded 5 rewards rows.');
    } else {
      console.log(`Rewards already populated (${count} rows), skip seeding.`);
    }

    const rows = await conn.query(
      'SELECT reward_id, reward_name, COALESCE(required_points, points_required) AS required_points FROM rewards ORDER BY COALESCE(required_points, points_required) ASC'
    );
    console.log('Current rewards:', rows);
  } finally {
    conn.release();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('seed_rewards failed:', err);
    process.exit(1);
  });
