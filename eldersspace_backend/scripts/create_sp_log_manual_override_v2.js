const pool = require('../config/db');

async function createProc() {
  const conn = await pool.getConnection();
  try {
    await conn.query('DROP PROCEDURE IF EXISTS sp_log_manual_override');

    const createSql = `CREATE PROCEDURE sp_log_manual_override(
      IN p_promo_code_id INT,
      IN p_code VARCHAR(255),
      IN p_action VARCHAR(64),
      IN p_old_status VARCHAR(64),
      IN p_new_status VARCHAR(64),
      IN p_override_reason VARCHAR(128),
      IN p_override_reason_custom VARCHAR(255),
      IN p_admin_id INT,
      IN p_admin_name VARCHAR(255),
      IN p_admin_phone VARCHAR(64),
      IN p_branch_id INT,
      IN p_branch_name VARCHAR(255),
      IN p_staff_id INT,
      IN p_staff_name VARCHAR(255),
      IN p_admin_notes TEXT,
      IN p_device_ip VARCHAR(64),
      IN p_user_agent VARCHAR(255)
    )
    BEGIN
      INSERT INTO manual_override_audit_log
      (promo_code_id, action, old_status, new_status, override_reason, override_reason_custom, admin_id, admin_name, admin_phone, branch_id, branch_name, staff_id, staff_name, admin_notes, device_ip)
      VALUES
      (p_promo_code_id, p_action, p_old_status, p_new_status, p_override_reason, p_override_reason_custom, p_admin_id, p_admin_name, p_admin_phone, p_branch_id, p_branch_name, p_staff_id, p_staff_name, p_admin_notes, p_device_ip);

      INSERT INTO promo_code_timeline
      (promo_code_id, event_type, event_title, event_description, actor_type, actor_id, actor_name, actor_phone, event_timestamp, event_status, event_metadata)
      VALUES
      (p_promo_code_id, 'manual_override', CONCAT('Manual override - ', p_action), CONCAT('Old: ', IFNULL(p_old_status,''), ' New: ', IFNULL(p_new_status,'')), 'admin', p_admin_id, p_admin_name, p_admin_phone, NOW(), p_new_status, CONCAT('reason=', IFNULL(p_override_reason,''), ';notes=', IFNULL(p_admin_notes,'')));
    END`;

    await conn.query(createSql);
    console.log('Stored procedure sp_log_manual_override (v2) created or replaced.');
  } catch (err) {
    console.error('Failed to create stored procedure v2:', err);
  } finally {
    conn.release();
    process.exit(0);
  }
}

createProc();
