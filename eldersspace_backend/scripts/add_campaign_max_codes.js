require('dotenv').config();
const pool = require('../config/db');

// Safe ALTER: skip ER_DUP_FIELDNAME, throw anything else
async function safeAdd(conn, table, colName, ddl) {
  try {
    await conn.query(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
    console.log(`  ✅ Added ${table}.${colName}`);
  } catch (e) {
    if (e.code === 'ER_DUP_FIELDNAME') {
      console.log(`  ⏭  ${table}.${colName} already exists`);
    } else {
      throw e;
    }
  }
}

async function migrate() {
  let conn;
  try {
    conn = await pool.getConnection();

    console.log('\n── promo_campaigns ──');
    await safeAdd(conn, 'promo_campaigns', 'max_codes',
      `max_codes INT NULL DEFAULT NULL COMMENT 'Max codes allowed. NULL = unlimited.'`);

    console.log('\n── promo_codes (missing columns) ──');
    await safeAdd(conn, 'promo_codes', 'is_deleted',
      `is_deleted TINYINT(1) NOT NULL DEFAULT 0`);
    await safeAdd(conn, 'promo_codes', 'file_hash',
      `file_hash VARCHAR(32) DEFAULT NULL COMMENT 'SHA-256 fingerprint for duplicate-file detection'`);
    await safeAdd(conn, 'promo_codes', 'status',
      `status VARCHAR(20) DEFAULT 'active'`);
    await safeAdd(conn, 'promo_codes', 'override_flag',
      `override_flag VARCHAR(50) DEFAULT NULL`);
    await safeAdd(conn, 'promo_codes', 'last_updated_by',
      `last_updated_by BIGINT DEFAULT NULL`);
    await safeAdd(conn, 'promo_codes', 'last_updated_at',
      `last_updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`);

    // Index on file_hash for fast duplicate-file lookup
    try {
      await conn.query(`ALTER TABLE promo_codes ADD INDEX idx_file_hash (file_hash)`);
      console.log('  ✅ Added index idx_file_hash');
    } catch (e) {
      if (e.code === 'ER_DUP_KEYNAME') {
        console.log('  ⏭  idx_file_hash already exists');
      } else {
        console.warn('  ⚠️  idx_file_hash:', e.message);
      }
    }

    conn.release();
    console.log('\n✅ Migration completed');
  } catch (error) {
    console.error('❌ Migration error:', error);
    if (conn) conn.release();
    process.exit(1);
  }
}

migrate().then(() => process.exit(0));
