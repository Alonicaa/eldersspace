const pool = require('../config/db');

function maskCode(code) {
  if (!code) return '';
  if (code.length <= 4) return '*'.repeat(code.length);
  const visible = Math.min(2, Math.floor(code.length / 4));
  return code.slice(0, visible) + '*'.repeat(Math.min(code.length - visible * 2, 6)) + code.slice(-visible);
}

// POST /api/rewards/report-code
// Body: { phone_number, redemption_id, issue_type, description }
// Uses redemption_id to look up which promo code was assigned to this user for this reward.
exports.submitReport = async (req, res) => {
  let conn;
  try {
    const { phone_number, redemption_id, issue_type, description } = req.body;

    if (!phone_number || !redemption_id) {
      return res.status(400).json({ error: 'phone_number and redemption_id are required' });
    }

    const validTypes = ['not_working', 'wrong_reward', 'already_expired', 'other'];
    const type = validTypes.includes(issue_type) ? issue_type : 'other';

    conn = await pool.connect();

    // Verify redemption belongs to this phone and get reward_id + user_id
    const { rows: rdRows } = await conn.query(
      `SELECT redemption_id, user_id, reward_id, reward_name
       FROM reward_redemption_history
       WHERE redemption_id = $1 AND phone_number = $2`,
      [redemption_id, phone_number]
    );

    if (!rdRows.length) {
      return res.status(404).json({ error: 'ไม่พบรายการแลกรางวัลนี้' });
    }

    const rd = rdRows[0];

    // Look up the promo code assigned to this user for this reward
    const { rows: pcRows } = await conn.query(
      `SELECT p.promo_code_id, p.reward_id, r.reward_name
       FROM promo_codes p
       LEFT JOIN rewards r ON p.reward_id = r.reward_id
       WHERE p.used_by_phone = $1 AND p.reward_id = $2 AND p.is_deleted = 0
       ORDER BY p.used_at DESC
       LIMIT 1`,
      [phone_number, rd.reward_id]
    );

    if (!pcRows.length) {
      return res.status(404).json({ error: 'ไม่พบโค้ดที่เชื่อมกับรายการแลกนี้' });
    }

    const promoRow = pcRows[0];

    // Prevent duplicate open reports for the same code + phone
    const { rows: existing } = await conn.query(
      `SELECT report_id FROM user_code_reports
       WHERE promo_code_id = $1 AND phone_number = $2 AND status IN ('pending','investigating') AND is_deleted = 0`,
      [promoRow.promo_code_id, phone_number]
    );

    if (existing.length) {
      return res.status(409).json({ error: 'คุณได้แจ้งปัญหาโค้ดนี้ไว้แล้ว กรุณารอการตรวจสอบ' });
    }

    const result = await conn.query(
      `INSERT INTO user_code_reports
         (user_id, phone_number, promo_code_id, reward_id, reward_name, issue_type, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING report_id`,
      [rd.user_id, phone_number, promoRow.promo_code_id, promoRow.reward_id, promoRow.reward_name || rd.reward_name, type, description || null]
    );
    const newReportId = result.rows[0].report_id;

    await conn.query(
      `INSERT INTO promo_code_logs (promo_code_id, code, action, user_id, phone_number, status, details)
       SELECT $1, code, 'user_report', $2, $3, 'success', $4
       FROM promo_codes WHERE promo_code_id = $1`,
      [promoRow.promo_code_id, rd.user_id, phone_number, JSON.stringify({ report_id: newReportId, redemption_id, issue_type: type })]
    );

    return res.json({
      success: true,
      message: 'แจ้งปัญหาสำเร็จ ทีมงานจะตรวจสอบและติดต่อกลับ',
      report_id: newReportId
    });
  } catch (error) {
    console.error('Submit code report error:', error);
    return res.status(500).json({ error: 'เกิดข้อผิดพลาด กรุณาลองใหม่' });
  } finally {
    if (conn) conn.release();
  }
};

// GET /api/rewards/my-reports?phone_number=&page=&limit=
exports.getUserReports = async (req, res) => {
  let conn;
  try {
    const { phone_number, page = 1, limit = 20 } = req.query;
    if (!phone_number) return res.status(400).json({ error: 'phone_number is required' });

    const offset = (Number(page) - 1) * Number(limit);
    conn = await pool.connect();

    const { rows: reports } = await conn.query(
      `SELECT
         r.report_id,
         r.reward_name,
         r.issue_type,
         r.description,
         r.status,
         r.admin_note,
         r.created_at,
         r.resolved_at,
         CONCAT('CPN-', LPAD(r.promo_code_id::text, 5, '0')) AS code_id_display,
         pc.used_at AS redeemed_at
       FROM user_code_reports r
       LEFT JOIN promo_codes pc ON r.promo_code_id = pc.promo_code_id
       WHERE r.phone_number = $1 AND r.is_deleted = 0
       ORDER BY r.created_at DESC
       LIMIT $2 OFFSET $3`,
      [phone_number, parseInt(limit), offset]
    );

    return res.json({ success: true, data: reports });
  } catch (error) {
    console.error('Get user reports error:', error);
    return res.status(500).json({ error: 'เกิดข้อผิดพลาด' });
  } finally {
    if (conn) conn.release();
  }
};

// ── Admin endpoints ──────────────────────────────────────────────────────────

// GET /api/admin/code-reports?status=&reward_id=&page=&limit=
exports.adminGetReports = async (req, res) => {
  let conn;
  try {
    const { status, reward_id, page = 1, limit = 50 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let paramIdx = 1;
    let where = 'r.is_deleted = 0';
    const params = [];

    if (status) { where += ` AND r.status = $${paramIdx++}`; params.push(status); }
    if (reward_id) { where += ` AND r.reward_id = $${paramIdx++}`; params.push(reward_id); }

    conn = await pool.connect();

    const { rows: reports } = await conn.query(
      `SELECT
         r.report_id,
         r.user_id,
         r.phone_number,
         u.full_name AS user_name,
         r.reward_id,
         r.reward_name,
         r.promo_code_id,
         r.issue_type,
         r.description,
         r.status,
         r.admin_note,
         r.created_at,
         r.resolved_at,
         pc.used_at AS redeemed_at,
         pc.is_used,
         -- Admin sees Code ID and masked code only, never the full code
         CONCAT('CPN-', LPAD(r.promo_code_id::text, 5, '0')) AS code_id_display
       FROM user_code_reports r
       LEFT JOIN users u ON r.user_id = u.user_id
       LEFT JOIN promo_codes pc ON r.promo_code_id = pc.promo_code_id
       WHERE ${where}
       ORDER BY r.created_at DESC
       LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      [...params, parseInt(limit), offset]
    );

    const { rows: countRes } = await conn.query(
      `SELECT COUNT(*) AS total FROM user_code_reports r WHERE ${where}`,
      params
    );

    return res.json({
      success: true,
      data: reports,
      total: Number(countRes[0]?.total || 0),
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (error) {
    console.error('Admin get code reports error:', error);
    return res.status(500).json({ error: 'เกิดข้อผิดพลาด' });
  } finally {
    if (conn) conn.release();
  }
};

// GET /api/admin/code-reports/:id  — report detail with redemption history (no full code)
exports.adminGetReportDetail = async (req, res) => {
  let conn;
  try {
    conn = await pool.connect();

    const { rows } = await conn.query(
      `SELECT
         r.*,
         u.full_name AS user_name,
         CONCAT('CPN-', LPAD(r.promo_code_id::text, 5, '0')) AS code_id_display,
         pc.reward_id AS pc_reward_id,
         pc.used_at AS redeemed_at,
         pc.is_used,
         pc.expiry_date,
         rw.reward_name AS reward_name_from_reward
       FROM user_code_reports r
       LEFT JOIN users u ON r.user_id = u.user_id
       LEFT JOIN promo_codes pc ON r.promo_code_id = pc.promo_code_id
       LEFT JOIN rewards rw ON pc.reward_id = rw.reward_id
       WHERE r.report_id = $1 AND r.is_deleted = 0`,
      [req.params.id]
    );

    if (!rows.length) return res.status(404).json({ error: 'Report not found' });

    // Fetch audit logs for this code (no full code in response)
    const { rows: logs } = await conn.query(
      `SELECT action, user_id, phone_number, status, details, created_at
       FROM promo_code_logs
       WHERE promo_code_id = $1
       ORDER BY created_at DESC
       LIMIT 20`,
      [rows[0].promo_code_id]
    );

    return res.json({ success: true, data: rows[0], audit_logs: logs });
  } catch (error) {
    console.error('Admin get report detail error:', error);
    return res.status(500).json({ error: 'เกิดข้อผิดพลาด' });
  } finally {
    if (conn) conn.release();
  }
};

// PATCH /api/admin/code-reports/:id/status
// Body: { status, admin_note }
exports.adminUpdateReportStatus = async (req, res) => {
  let conn;
  try {
    const { status, admin_note } = req.body;
    const validStatuses = ['pending', 'investigating', 'resolved', 'rejected'];

    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${validStatuses.join(', ')}` });
    }

    conn = await pool.connect();
    const { rows } = await conn.query(
      'SELECT report_id, promo_code_id, user_id, phone_number FROM user_code_reports WHERE report_id = $1 AND is_deleted = 0',
      [req.params.id]
    );

    if (!rows.length) return res.status(404).json({ error: 'Report not found' });

    const resolved_at = status === 'resolved' || status === 'rejected' ? new Date() : null;

    await conn.query(
      `UPDATE user_code_reports
       SET status = $1, admin_note = $2, resolved_at = $3, updated_at = NOW()
       WHERE report_id = $4`,
      [status, admin_note || null, resolved_at, req.params.id]
    );

    // Audit log
    await conn.query(
      `INSERT INTO promo_code_logs (promo_code_id, code, action, user_id, phone_number, status, details)
       SELECT $1, code, 'admin_report_update', $2, $3, 'success', $4
       FROM promo_codes WHERE promo_code_id = $5`,
      [
        rows[0].promo_code_id,
        rows[0].user_id,
        rows[0].phone_number,
        JSON.stringify({ report_id: req.params.id, new_status: status, admin_note: admin_note || null }),
        rows[0].promo_code_id
      ]
    );

    return res.json({ success: true, message: 'อัพเดทสถานะสำเร็จ' });
  } catch (error) {
    console.error('Admin update report status error:', error);
    return res.status(500).json({ error: 'เกิดข้อผิดพลาด' });
  } finally {
    if (conn) conn.release();
  }
};
