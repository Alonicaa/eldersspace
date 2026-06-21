/**
 * Migration: Add manual override system tables and columns
 * Run with: node scripts/run_migration.js
 */

require('dotenv').config();
const pool = require('../config/db');

// Columns to add to promo_codes (MySQL doesn't have ADD COLUMN IF NOT EXISTS)
const columnsToAdd = [
    { name: 'override_flag',        ddl: `override_flag VARCHAR(50) DEFAULT NULL` },
    { name: 'override_reason',      ddl: `override_reason VARCHAR(255) DEFAULT NULL` },
    { name: 'override_by_admin_id', ddl: `override_by_admin_id BIGINT DEFAULT NULL` },
    { name: 'override_at',          ddl: `override_at TIMESTAMP NULL DEFAULT NULL` },
    { name: 'last_updated_by',      ddl: `last_updated_by BIGINT DEFAULT NULL` },
    { name: 'last_updated_at',      ddl: `last_updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP` },
];

const migrations = [
    {
        name: 'Create manual_override_audit_log table',
        sql: `CREATE TABLE IF NOT EXISTS manual_override_audit_log (
            audit_log_id BIGINT AUTO_INCREMENT PRIMARY KEY,
            promo_code_id BIGINT NOT NULL,
            code VARCHAR(100) NOT NULL,
            campaign_id BIGINT,
            reward_id BIGINT,
            assigned_user_id BIGINT,
            assigned_phone VARCHAR(20),
            action VARCHAR(50) NOT NULL,
            old_status VARCHAR(50) NOT NULL,
            new_status VARCHAR(50) NOT NULL,
            override_reason VARCHAR(50),
            override_reason_custom VARCHAR(255),
            admin_notes TEXT,
            admin_id BIGINT NOT NULL,
            admin_name VARCHAR(100),
            admin_phone VARCHAR(20),
            admin_email VARCHAR(100),
            branch_id BIGINT,
            branch_name VARCHAR(100),
            staff_id BIGINT,
            staff_name VARCHAR(100),
            device_ip VARCHAR(45),
            device_user_agent TEXT,
            action_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            is_critical TINYINT(1) DEFAULT 0,
            reversal_audit_log_id BIGINT,
            metadata JSON,
            INDEX idx_promo_code_id (promo_code_id),
            INDEX idx_admin_id (admin_id),
            INDEX idx_action (action),
            INDEX idx_action_timestamp (action_timestamp),
            INDEX idx_code (code),
            INDEX idx_override_reason (override_reason),
            INDEX idx_assigned_user_id (assigned_user_id)
        )`
    },
    {
        name: 'Create promo_code_timeline table',
        sql: `CREATE TABLE IF NOT EXISTS promo_code_timeline (
            timeline_id BIGINT AUTO_INCREMENT PRIMARY KEY,
            promo_code_id BIGINT NOT NULL,
            event_type VARCHAR(50) NOT NULL,
            event_title VARCHAR(255),
            actor_type VARCHAR(50),
            actor_id BIGINT,
            actor_name VARCHAR(100),
            event_metadata JSON,
            related_audit_log_id BIGINT,
            event_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_promo_code_id (promo_code_id),
            INDEX idx_event_timestamp (event_timestamp)
        )`
    }
];

async function runMigrations() {
    let conn;
    try {
        conn = await pool.getConnection();
        console.log('✅ Connected to database\n');

        const dbName = process.env.DB_DATABASE;
        let ok = 0;
        let skip = 0;
        let fail = 0;

        // Step 1: Add optional columns to promo_codes (MySQL-safe)
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

        // Step 2: Create tables
        for (const m of migrations) {
            try {
                await conn.query(m.sql);
                console.log(`  ✅ ${m.name}`);
                ok++;
            } catch (e) {
                console.error(`  ❌ ${m.name}: ${e.message}`);
                fail++;
            }
        }

        console.log(`\nDone: ${ok} applied, ${skip} skipped, ${fail} failed`);
    } catch (e) {
        console.error('Connection failed:', e.message);
    } finally {
        if (conn) conn.release();
        process.exit(0);
    }
}

runMigrations();
