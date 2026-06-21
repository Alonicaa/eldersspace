/**
 * Migration v2: Add simplified status model columns to promo_codes
 * Run with: node scripts/run_migration_v2.js
 *
 * New model:
 *   status: active | redeemed | expired | cancelled | replaced
 *   redeemed_by, redeemed_at — who confirmed the redemption
 *   replacement_for, replaced_by — code replacement linkage
 *   issue_reason, note — metadata
 */

require('dotenv').config();
const pool = require('../config/db');

const columnsToAdd = [
    { name: 'status',          ddl: `status VARCHAR(20) DEFAULT 'active'` },
    { name: 'redeemed_by',     ddl: `redeemed_by BIGINT DEFAULT NULL` },
    { name: 'redeemed_at',     ddl: `redeemed_at TIMESTAMP NULL DEFAULT NULL` },
    { name: 'replacement_for', ddl: `replacement_for BIGINT DEFAULT NULL` },
    { name: 'replaced_by',     ddl: `replaced_by BIGINT DEFAULT NULL` },
    { name: 'issue_reason',    ddl: `issue_reason VARCHAR(255) DEFAULT NULL` },
    { name: 'note',            ddl: `note TEXT DEFAULT NULL` },
];

async function run() {
    let conn;
    try {
        conn = await pool.getConnection();
        console.log('✅ Connected to database\n');
        const dbName = process.env.DB_DATABASE;
        let ok = 0, skip = 0, fail = 0;

        // Step 1: Add columns (MySQL-safe check)
        for (const col of columnsToAdd) {
            try {
                const [rows] = await conn.query(
                    `SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS
                     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'promo_codes' AND COLUMN_NAME = ?`,
                    [dbName, col.name]
                );
                if (rows[0].cnt > 0) {
                    console.log(`  ⏭  promo_codes.${col.name} already exists`);
                    skip++;
                } else {
                    await conn.query(`ALTER TABLE promo_codes ADD COLUMN ${col.ddl}`);
                    console.log(`  ✅ Added promo_codes.${col.name}`);
                    ok++;
                }
            } catch (e) {
                console.error(`  ❌ promo_codes.${col.name}: ${e.message}`);
                fail++;
            }
        }

        // Step 2: Backfill status from is_used + override_flag
        try {
            const [result] = await conn.query(`
                UPDATE promo_codes
                SET status = CASE
                    WHEN override_flag = 'cancelled'  THEN 'cancelled'
                    WHEN override_flag = 'replaced'   THEN 'replaced'
                    WHEN override_flag IN ('expired')  THEN 'expired'
                    WHEN is_used = 1                  THEN 'redeemed'
                    WHEN expiry_date IS NOT NULL AND expiry_date < NOW() THEN 'expired'
                    ELSE 'active'
                END
                WHERE status IS NULL OR status = '' OR status = 'active'
            `);
            console.log(`  ✅ Backfilled status column (${result.affectedRows} rows)`);
            ok++;
        } catch (e) {
            console.error(`  ❌ Backfill status: ${e.message}`);
            fail++;
        }

        // Step 3: Backfill redeemed_at from used_at (for is_used=1 rows)
        try {
            const [result] = await conn.query(`
                UPDATE promo_codes
                SET redeemed_at = used_at
                WHERE is_used = 1 AND redeemed_at IS NULL AND used_at IS NOT NULL
            `);
            console.log(`  ✅ Backfilled redeemed_at (${result.affectedRows} rows)`);
            ok++;
        } catch (e) {
            console.error(`  ❌ Backfill redeemed_at: ${e.message}`);
            fail++;
        }

        console.log(`\nDone: ${ok} applied, ${skip} skipped, ${fail} failed`);
    } catch (e) {
        console.error('Connection failed:', e.message);
    } finally {
        if (conn) conn.release();
        process.exit(0);
    }
}

run();
