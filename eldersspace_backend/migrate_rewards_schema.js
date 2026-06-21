require('dotenv').config();
const mariadb = require('mariadb');

async function columnExists(conn, tableName, columnName) {
  const rows = await conn.query(
    `SELECT COUNT(*) AS total
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = ?
       AND column_name = ?`,
    [tableName, columnName]
  );
  return Number(rows[0]?.total || 0) > 0;
}

(async () => {
  const pool = mariadb.createPool({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    allowPublicKeyRetrieval: true
  });

  const conn = await pool.getConnection();
  try {
    const actions = [];

    if (!(await columnExists(conn, 'rewards', 'points_required'))) {
      actions.push('ADD COLUMN points_required INT DEFAULT 0 AFTER reward_name');
    }
    if (!(await columnExists(conn, 'rewards', 'campaign_start_date'))) {
      actions.push('ADD COLUMN campaign_start_date DATETIME DEFAULT NULL AFTER user_limit');
    }
    if (!(await columnExists(conn, 'rewards', 'campaign_end_date'))) {
      actions.push('ADD COLUMN campaign_end_date DATETIME DEFAULT NULL AFTER campaign_start_date');
    }
    if (!(await columnExists(conn, 'rewards', 'usage_instructions'))) {
      actions.push('ADD COLUMN usage_instructions TEXT DEFAULT NULL AFTER campaign_end_date');
    }
    if (!(await columnExists(conn, 'rewards', 'validity_hours'))) {
      actions.push('ADD COLUMN validity_hours INT DEFAULT 1 AFTER usage_instructions');
    }

    if (actions.length === 0) {
      console.log('No schema changes needed.');
      return;
    }

    const alterSql = `ALTER TABLE rewards ${actions.join(', ')}`;
    console.log('Running:', alterSql);
    await conn.query(alterSql);

    if (await columnExists(conn, 'rewards', 'points_required')) {
      await conn.query(
        'UPDATE rewards SET points_required = required_points WHERE (points_required IS NULL OR points_required = 0) AND required_points IS NOT NULL'
      );
    }

    const rows = await conn.query(
      "SELECT COLUMN_NAME FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'rewards' ORDER BY ORDINAL_POSITION"
    );
    console.log('Current columns:', rows.map((row) => row.COLUMN_NAME).join(', '));
  } catch (error) {
    console.error('Migration failed:', error);
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
  }
})();
