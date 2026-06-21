#!/usr/bin/env node

require('dotenv').config();
const pool = require('../config/db');

async function runMigration() {
  let conn;
  
  try {
    console.log('🔄 Starting migration: Add Manual Code Override System...\n');
    
    conn = await pool.getConnection();
    
    let successCount = 0;
    let failureCount = 0;
    
    // All statements to execute
    const statements = [
      {
        name: 'Add override_flag column',
        sql: `ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS override_flag VARCHAR(50) DEFAULT NULL`
      },
      {
        name: 'Add override_reason column',
        sql: `ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS override_reason VARCHAR(255) DEFAULT NULL`
      },
      {
        name: 'Add override_by_admin_id column',
        sql: `ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS override_by_admin_id BIGINT DEFAULT NULL`
      },
      {
        name: 'Add override_at column',
        sql: `ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS override_at TIMESTAMP NULL DEFAULT NULL`
      },
      {
        name: 'Add last_updated_by column',
        sql: `ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS last_updated_by BIGINT DEFAULT NULL`
      },
      {
        name: 'Add last_updated_at column',
        sql: `ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS last_updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`
      },
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
      },
      {
        name: 'Create promo_code_status_reference table',
        sql: `CREATE TABLE IF NOT EXISTS promo_code_status_reference (
          status_id INT AUTO_INCREMENT PRIMARY KEY,
          status_name VARCHAR(50) UNIQUE,
          status_label_th VARCHAR(100),
          status_color VARCHAR(20),
          is_terminal TINYINT(1),
          is_manual_only TINYINT(1)
        )`
      },
      {
        name: 'Create override_reason_reference table',
        sql: `CREATE TABLE IF NOT EXISTS override_reason_reference (
          reason_id INT AUTO_INCREMENT PRIMARY KEY,
          reason_code VARCHAR(50) UNIQUE,
          reason_label_th VARCHAR(255),
          severity VARCHAR(20)
        )`
      },
      {
        name: 'Create admin_override_privileges table',
        sql: `CREATE TABLE IF NOT EXISTS admin_override_privileges (
          privilege_id BIGINT AUTO_INCREMENT PRIMARY KEY,
          admin_id BIGINT NOT NULL,
          can_force_redeem TINYINT(1) DEFAULT 0,
          can_reset_status TINYINT(1) DEFAULT 0,
          can_cancel_code TINYINT(1) DEFAULT 0,
          daily_override_limit INT DEFAULT 100,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_admin_id (admin_id)
        )`
      },
      {
        name: 'Create override_approval_queue table',
        sql: `CREATE TABLE IF NOT EXISTS override_approval_queue (
          approval_id BIGINT AUTO_INCREMENT PRIMARY KEY,
          promo_code_id BIGINT,
          requested_by_admin_id BIGINT,
          requested_action VARCHAR(50),
          request_reason TEXT,
          approver_admin_id BIGINT,
          approval_status VARCHAR(50),
          response_timestamp TIMESTAMP NULL,
          expires_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`
      },
      {
        name: 'Insert status reference data',
        sql: `INSERT IGNORE INTO promo_code_status_reference (status_name, status_label_th, status_color, is_terminal, is_manual_only) VALUES
          ('ready', 'พร้อมใช้', 'green', 0, 0),
          ('reserved', 'จองแล้ว', 'blue', 0, 0),
          ('redeemed', 'แลกแล้ว', 'cyan', 1, 0),
          ('expired', 'หมดอายุ', 'red', 1, 0),
          ('cancelled', 'ยกเลิก', 'gray', 1, 0),
          ('refunded', 'คืนเงิน', 'gray', 1, 0),
          ('manual_redeemed', 'แลกแล้ว(manual)', 'purple', 1, 1)`
      },
      {
        name: 'Insert reason reference data',
        sql: `INSERT IGNORE INTO override_reason_reference (reason_code, reason_label_th, severity) VALUES
          ('qr_failed', 'QR ใช้งานไม่ได้', 'medium'),
          ('app_issue', 'ลูกค้าแอพมีปัญหา', 'medium'),
          ('scan_failed', 'สแกนไม่ผ่าน', 'low'),
          ('system_down', 'ระบบล่ม', 'high'),
          ('branch_redeem', 'แลกที่สาขา', 'medium'),
          ('manual_compensation', 'ชดเชยด้วยตนเอง', 'medium'),
          ('other', 'อื่นๆ', 'low')`
      }
    ];
    
    // Execute all statements
    for (const stmt of statements) {
      try {
        console.log(`⏳ ${stmt.name}...`);
        await conn.query(stmt.sql);
        successCount++;
        console.log(`✅ ${stmt.name} - Success\n`);
      } catch (error) {
        failureCount++;
        console.log(`❌ ${stmt.name} - Failed: ${error.message}\n`);
      }
    }
    
    console.log('============================================================');
    console.log('🎉 Migration completed!');
    console.log(`✅ Successful: ${successCount}`);
    console.log(`❌ Failed: ${failureCount}`);
    console.log('============================================================\n');
    
    // Verify created tables
    console.log('📋 Verifying created tables...\n');
    const tables = [
      'manual_override_audit_log',
      'promo_code_timeline',
      'admin_override_privileges',
      'override_approval_queue',
      'promo_code_status_reference',
      'override_reason_reference'
    ];
    
    for (const table of tables) {
      try {
        const result = await conn.query(`SHOW TABLES LIKE ?`, [table]);
        if (result.length > 0) {
          console.log(`✅ ${table} - FOUND`);
        } else {
          console.log(`❌ ${table} - NOT FOUND`);
        }
      } catch (error) {
        console.log(`❌ ${table} - ERROR`);
      }
    }
    
    // Verify new columns in promo_codes
    console.log('\n📋 Verifying promo_codes columns...\n');
    const columns = [
      'override_flag',
      'override_reason',
      'override_by_admin_id',
      'override_at',
      'last_updated_by',
      'last_updated_at'
    ];
    
    for (const column of columns) {
      try {
        const result = await conn.query(
          `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = ? AND COLUMN_NAME = ?`,
          ['promo_codes', column]
        );
        if (result.length > 0) {
          console.log(`✅ ${column} - FOUND`);
        } else {
          console.log(`❌ ${column} - NOT FOUND`);
        }
      } catch (error) {
        console.log(`❌ ${column} - ERROR`);
      }
    }
    
    console.log('\n============================================================');
    console.log('🚀 Database migration completed successfully!');
    console.log('============================================================\n');
    
  } catch (error) {
    console.error('❌ Migration error:', error);
    process.exit(1);
  } finally {
    if (conn) await conn.release();
    process.exit(0);
  }
}

runMigration();
