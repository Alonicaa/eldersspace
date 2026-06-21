const pool = require('../config/db');

async function tableHasColumn(conn, tableName, columnName) {
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

async function run() {
  const conn = await pool.getConnection();

  try {
    await conn.query(
      `CREATE TABLE IF NOT EXISTS security_logs (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        event_type VARCHAR(64) NOT NULL,
        actor_name VARCHAR(255) NULL,
        actor_phone VARCHAR(50) NULL,
        target_name VARCHAR(255) NULL,
        target_phone VARCHAR(50) NULL,
        ip_address VARCHAR(64) NULL,
        device VARCHAR(255) NULL,
        detail TEXT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        INDEX idx_security_logs_created_at (created_at),
        INDEX idx_security_logs_event_type_created (event_type, created_at),
        INDEX idx_security_logs_actor_phone (actor_phone),
        INDEX idx_security_logs_target_phone (target_phone)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
    );

    const existing = await conn.query('SELECT COUNT(*) AS total FROM security_logs');
    const existingCount = Number(existing[0]?.total || 0);
    if (existingCount > 0) {
      console.log(`security_logs already has ${existingCount} rows; skip backfill`);
      return;
    }

    const hasVerified = await tableHasColumn(conn, 'otp_verification', 'is_verified');
    const otpRows = await conn.query(
      `SELECT o.created_at, o.expired_at,
              ${hasVerified ? 'o.is_verified' : '0 AS is_verified'},
              u.full_name,
              u.phone_number
       FROM otp_verification o
       LEFT JOIN users u ON u.user_id = o.user_id
       ORDER BY o.created_at DESC
       LIMIT 300`
    );

    let inserted = 0;
    for (const row of otpRows) {
      const actorName = row.full_name || row.phone_number || '-';
      const actorPhone = row.phone_number || null;

      await conn.query(
        `INSERT INTO security_logs(event_type, actor_name, actor_phone, detail, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        ['user_otp_request', actorName, actorPhone, 'Historical OTP request (migrated)', row.created_at]
      );
      inserted += 1;

      if (Number(row.is_verified || 0) === 1) {
        await conn.query(
          `INSERT INTO security_logs(event_type, actor_name, actor_phone, detail, created_at)
           VALUES (?, ?, ?, ?, ?)`,
          ['user_otp_success', actorName, actorPhone, 'Historical OTP verified (migrated)', row.created_at]
        );
        inserted += 1;
      } else if (row.expired_at) {
        const expiredAt = new Date(row.expired_at);
        if (!Number.isNaN(expiredAt.getTime()) && expiredAt.getTime() < Date.now()) {
          await conn.query(
            `INSERT INTO security_logs(event_type, actor_name, actor_phone, detail, created_at)
             VALUES (?, ?, ?, ?, ?)`,
            ['user_otp_failed', actorName, actorPhone, 'Historical OTP expired/failed (migrated)', row.expired_at]
          );
          inserted += 1;
        }
      }
    }

    const total = await conn.query('SELECT COUNT(*) AS total FROM security_logs');
    console.log(`inserted ${inserted} rows; total ${Number(total[0]?.total || 0)}`);
  } finally {
    conn.release();
  }
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Backfill failed:', error);
    process.exit(1);
  });
