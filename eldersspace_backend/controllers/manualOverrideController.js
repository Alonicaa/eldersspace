/**
 * Manual Code Override Controller
 * Redesigned May 2026 — simplified status model
 *
 * Statuses: active | redeemed | expired | cancelled | replaced
 */

const pool = require('../config/db');
const crypto = require('crypto');

// ─── helpers ──────────────────────────────────────────────────────────────────

function computeStatus(row) {
    if (row.status && row.status !== 'active') return row.status;
    if (row.override_flag === 'cancelled')  return 'cancelled';
    if (row.override_flag === 'replaced')   return 'replaced';
    if (row.override_flag === 'expired')    return 'expired';
    if (row.is_used === 1)                  return 'redeemed';
    if (row.expiry_date && new Date(row.expiry_date) < new Date()) return 'expired';
    return row.status || 'active';
}

function generateCode() {
    return 'RPL-' + crypto.randomBytes(5).toString('hex').toUpperCase();
}

function buildSyntheticTimeline(code) {
    const events = [];
    if (code.created_at) {
        events.push({ event_type: 'created', event_title: 'สร้างโค้ด', event_timestamp: code.created_at, actor_type: 'system', actor_name: 'ระบบ' });
    }
    if (code.replacement_for) {
        events.push({ event_type: 'created', event_title: 'ออกโค้ดใหม่แทนโค้ดเก่า', event_timestamp: code.created_at, actor_type: 'admin' });
    }
    const usedAt = code.redeemed_at || code.used_at;
    if (usedAt) {
        const status = computeStatus(code);
        events.push({ event_type: 'used', event_title: status === 'redeemed' ? 'ยืนยันการใช้งาน' : 'ใช้งานโค้ด', event_timestamp: usedAt, actor_type: 'admin' });
    }
    const st = computeStatus(code);
    if (st === 'cancelled' && code.last_updated_at) {
        events.push({ event_type: 'cancelled', event_title: 'ยกเลิกโค้ด', event_timestamp: code.last_updated_at, actor_type: 'admin' });
    }
    if (st === 'replaced' && code.last_updated_at) {
        events.push({ event_type: 'cancelled', event_title: 'ออกโค้ดใหม่แทน', event_timestamp: code.last_updated_at, actor_type: 'admin' });
    }
    if (st === 'expired') {
        const expAt = code.expiry_date || code.last_updated_at;
        if (expAt) events.push({ event_type: 'expired', event_title: 'หมดอายุ', event_timestamp: expAt, actor_type: 'system', actor_name: 'ระบบ' });
    }
    return events;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. GET PROMO CODE DETAIL
// ═══════════════════════════════════════════════════════════════════════════════

exports.getPromoCodeDetail = async (req, res) => {
    let conn;
    try {
        const { promo_code_id } = req.params;
        if (!promo_code_id) return res.status(400).json({ error: 'promo_code_id is required' });

        conn = await pool.getConnection();

        let codeRows;
        try {
            [codeRows] = await conn.query(`
                SELECT
                    p.promo_code_id, p.code, p.reward_id,
                    r.reward_name, r.required_points AS reward_points,
                    p.campaign_id, p.description, p.expiry_date,
                    p.is_used, p.used_by_phone, p.used_by_user_id, p.used_at,
                    p.created_at, p.override_flag, p.last_updated_by, p.last_updated_at,
                    p.status, p.redeemed_by, p.redeemed_at,
                    p.replacement_for, p.replaced_by, p.issue_reason, p.note
                FROM promo_codes p
                LEFT JOIN rewards r ON p.reward_id = r.reward_id
                WHERE p.promo_code_id = ?
            `, [promo_code_id]);
        } catch (e) {
            [codeRows] = await conn.query(`
                SELECT
                    p.promo_code_id, p.code, p.reward_id,
                    r.reward_name, r.required_points AS reward_points,
                    p.campaign_id, p.description, p.expiry_date,
                    p.is_used, p.used_by_phone, p.used_by_user_id, p.used_at,
                    p.created_at, p.override_flag, p.last_updated_by, p.last_updated_at,
                    NULL AS status, NULL AS redeemed_by, NULL AS redeemed_at,
                    NULL AS replacement_for, NULL AS replaced_by, NULL AS issue_reason, NULL AS note
                FROM promo_codes p
                LEFT JOIN rewards r ON p.reward_id = r.reward_id
                WHERE p.promo_code_id = ?
            `, [promo_code_id]);
        }

        if (!codeRows.length) {
            conn.release();
            return res.status(404).json({ error: 'Promo code not found' });
        }

        const code = codeRows[0];
        code.current_status = computeStatus(code);

        // Look up assigned user (try redeemed_by → used_by_user_id → used_by_phone)
        let assignedUser = null;
        const userId = code.redeemed_by || code.used_by_user_id;
        if (userId) {
            try {
                const [userRows] = await conn.query(
                    `SELECT user_id, phone_number, full_name FROM users WHERE user_id = ?`,
                    [userId]
                );
                assignedUser = userRows[0] || null;
            } catch (e) {
                console.warn('[getPromoCodeDetail] user lookup by id failed', e.message);
            }
        }
        if (!assignedUser && code.used_by_phone) {
            try {
                const [userRows] = await conn.query(
                    `SELECT user_id, phone_number, full_name FROM users WHERE phone_number = ?`,
                    [code.used_by_phone]
                );
                assignedUser = userRows[0] || null;
            } catch (e) {
                console.warn('[getPromoCodeDetail] user lookup by phone failed', e.message);
            }
        }

        // Timeline (real events from table, fallback to synthetic)
        let timeline = [];
        try {
            [timeline] = await conn.query(`
                SELECT event_type, event_title, actor_type, actor_id, actor_name,
                       event_timestamp, event_metadata
                FROM promo_code_timeline
                WHERE promo_code_id = ?
                ORDER BY event_timestamp ASC
            `, [promo_code_id]);
        } catch (e) {
            console.warn('[getPromoCodeDetail] timeline query failed', e.message);
        }
        if (!timeline.length) {
            timeline = buildSyntheticTimeline(code);
        }

        // Audit log
        let auditLog = [];
        try {
            [auditLog] = await conn.query(`
                SELECT audit_log_id, action, old_status, new_status,
                       override_reason, override_reason_custom, admin_id, admin_name,
                       admin_phone, admin_notes, device_ip, action_timestamp
                FROM manual_override_audit_log
                WHERE promo_code_id = ?
                ORDER BY action_timestamp DESC
            `, [promo_code_id]);
        } catch (e) {
            console.warn('[getPromoCodeDetail] audit log query failed', e.message);
        }

        conn.release();

        return res.json({
            success: true,
            data: { code, assignedUser, timeline, auditLog }
        });

    } catch (error) {
        console.error('Get promo code detail error:', error);
        if (conn) conn.release();
        return res.status(500).json({ error: 'Failed to get promo code details' });
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// 2. CONFIRM CODE — ยืนยันการใช้งาน (sets status = redeemed)
// ═══════════════════════════════════════════════════════════════════════════════

exports.confirmCode = async (req, res) => {
    let conn;
    try {
        const { promo_code_id, note, device_ip } = req.body;
        const adminId   = req.user?.user_id;
        const adminName = req.user?.full_name;
        const adminPhone = req.user?.phone_number;

        if (!promo_code_id || !adminId) {
            return res.status(400).json({ error: 'promo_code_id and admin credentials required' });
        }

        conn = await pool.getConnection();
        await conn.beginTransaction();

        try {
            const [codeRows] = await conn.query(
                'SELECT * FROM promo_codes WHERE promo_code_id = ? FOR UPDATE',
                [promo_code_id]
            );
            if (!codeRows.length) {
                await conn.rollback();
                return res.status(404).json({ error: 'Promo code not found' });
            }
            const currentCode = codeRows[0];
            const oldStatus = computeStatus(currentCode);

            try {
                await conn.query(`
                    UPDATE promo_codes
                    SET status='redeemed', redeemed_by=?, redeemed_at=NOW(),
                        is_used=1, used_at=NOW(),
                        last_updated_by=?, last_updated_at=NOW()
                    WHERE promo_code_id=?
                `, [adminId, adminId, promo_code_id]);
            } catch (e) {
                await conn.query(
                    `UPDATE promo_codes SET is_used=1, used_at=NOW() WHERE promo_code_id=?`,
                    [promo_code_id]
                );
            }

            try {
                await conn.query(`
                    INSERT INTO manual_override_audit_log
                    (promo_code_id, code, action, old_status, new_status,
                     admin_notes, admin_id, admin_name, admin_phone, device_ip)
                    VALUES (?, ?, 'confirm', ?, 'redeemed', ?, ?, ?, ?, ?)
                `, [promo_code_id, currentCode.code, oldStatus,
                    note || null, adminId, adminName, adminPhone, device_ip || null]);
            } catch (e) { console.warn('[confirmCode] audit log failed', e.message); }

            try {
                await conn.query(`
                    INSERT INTO promo_code_timeline
                    (promo_code_id, event_type, event_title, actor_type, actor_id, actor_name, event_timestamp, event_metadata)
                    VALUES (?, 'used', 'ยืนยันการใช้งาน', 'admin', ?, ?, NOW(), ?)
                `, [promo_code_id, adminId, adminName, JSON.stringify({ note, device_ip })]);
            } catch (e) { console.warn('[confirmCode] timeline failed', e.message); }

            await conn.commit();
            return res.json({ success: true, message: 'Code confirmed successfully', data: { promo_code_id, new_status: 'redeemed' } });
        } catch (err) {
            await conn.rollback();
            throw err;
        }
    } catch (error) {
        console.error('Confirm code error:', error);
        if (conn) conn.release();
        return res.status(500).json({ error: 'Failed to confirm code' });
    } finally {
        if (conn) conn.release();
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// 3. CANCEL CODE — ยกเลิกโค้ด (sets status = cancelled)
// ═══════════════════════════════════════════════════════════════════════════════

exports.cancelCode = async (req, res) => {
    let conn;
    try {
        const { promo_code_id, note, device_ip } = req.body;
        const adminId   = req.user?.user_id;
        const adminName = req.user?.full_name;
        const adminPhone = req.user?.phone_number;

        if (!promo_code_id || !adminId) {
            return res.status(400).json({ error: 'promo_code_id and admin credentials required' });
        }

        conn = await pool.getConnection();
        await conn.beginTransaction();

        try {
            const [codeRows] = await conn.query(
                'SELECT * FROM promo_codes WHERE promo_code_id = ? FOR UPDATE',
                [promo_code_id]
            );
            if (!codeRows.length) {
                await conn.rollback();
                return res.status(404).json({ error: 'Promo code not found' });
            }
            const currentCode = codeRows[0];
            const oldStatus = computeStatus(currentCode);

            try {
                await conn.query(`
                    UPDATE promo_codes
                    SET status='cancelled', override_flag='cancelled',
                        last_updated_by=?, last_updated_at=NOW()
                    WHERE promo_code_id=?
                `, [adminId, promo_code_id]);
            } catch (e) {
                await conn.query(
                    `UPDATE promo_codes SET override_flag='cancelled' WHERE promo_code_id=?`,
                    [promo_code_id]
                );
            }

            try {
                await conn.query(`
                    INSERT INTO manual_override_audit_log
                    (promo_code_id, code, action, old_status, new_status,
                     admin_notes, admin_id, admin_name, admin_phone, device_ip)
                    VALUES (?, ?, 'cancel_code', ?, 'cancelled', ?, ?, ?, ?, ?)
                `, [promo_code_id, currentCode.code, oldStatus,
                    note || null, adminId, adminName, adminPhone, device_ip || null]);
            } catch (e) { console.warn('[cancelCode] audit log failed', e.message); }

            try {
                await conn.query(`
                    INSERT INTO promo_code_timeline
                    (promo_code_id, event_type, event_title, actor_type, actor_id, actor_name, event_timestamp, event_metadata)
                    VALUES (?, 'cancelled', 'ยกเลิกโค้ด', 'admin', ?, ?, NOW(), ?)
                `, [promo_code_id, adminId, adminName, JSON.stringify({ note, device_ip })]);
            } catch (e) { console.warn('[cancelCode] timeline failed', e.message); }

            await conn.commit();
            return res.json({ success: true, message: 'Code cancelled successfully', data: { promo_code_id, new_status: 'cancelled' } });
        } catch (err) {
            await conn.rollback();
            throw err;
        }
    } catch (error) {
        console.error('Cancel code error:', error);
        if (conn) conn.release();
        return res.status(500).json({ error: 'Failed to cancel code' });
    } finally {
        if (conn) conn.release();
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// 4. REPLACE CODE — ออกโค้ดใหม่แทน
//    Marks old code as 'replaced', creates new code with same reward
// ═══════════════════════════════════════════════════════════════════════════════

exports.replaceCode = async (req, res) => {
    let conn;
    try {
        const { promo_code_id, issue_reason, note, device_ip } = req.body;
        const adminId   = req.user?.user_id;
        const adminName = req.user?.full_name;
        const adminPhone = req.user?.phone_number;

        if (!promo_code_id || !adminId) {
            return res.status(400).json({ error: 'promo_code_id and admin credentials required' });
        }

        conn = await pool.getConnection();
        await conn.beginTransaction();

        try {
            const [codeRows] = await conn.query(
                'SELECT * FROM promo_codes WHERE promo_code_id = ? FOR UPDATE',
                [promo_code_id]
            );
            if (!codeRows.length) {
                await conn.rollback();
                return res.status(404).json({ error: 'Promo code not found' });
            }
            const oldCode = codeRows[0];
            const oldStatus = computeStatus(oldCode);
            const newCodeValue = generateCode();

            // Insert new promo code
            let newCodeId;
            try {
                const [insertResult] = await conn.query(`
                    INSERT INTO promo_codes
                    (code, reward_id, campaign_id, description, expiry_date,
                     is_used, created_at, status, replacement_for, issue_reason, note)
                    VALUES (?, ?, ?, ?, ?, 0, NOW(), 'active', ?, ?, ?)
                `, [
                    newCodeValue,
                    oldCode.reward_id,
                    oldCode.campaign_id,
                    oldCode.description,
                    oldCode.expiry_date,
                    promo_code_id,
                    issue_reason || null,
                    note || null
                ]);
                newCodeId = insertResult.insertId;
            } catch (e) {
                // Fallback without new columns
                const [insertResult] = await conn.query(`
                    INSERT INTO promo_codes (code, reward_id, campaign_id, description, expiry_date, is_used, created_at)
                    VALUES (?, ?, ?, ?, ?, 0, NOW())
                `, [newCodeValue, oldCode.reward_id, oldCode.campaign_id, oldCode.description, oldCode.expiry_date]);
                newCodeId = insertResult.insertId;
            }

            // Mark old code as replaced
            try {
                await conn.query(`
                    UPDATE promo_codes
                    SET status='replaced', override_flag='replaced', replaced_by=?,
                        last_updated_by=?, last_updated_at=NOW()
                    WHERE promo_code_id=?
                `, [newCodeId, adminId, promo_code_id]);
            } catch (e) {
                await conn.query(
                    `UPDATE promo_codes SET override_flag='replaced' WHERE promo_code_id=?`,
                    [promo_code_id]
                );
            }

            // Audit logs for both old and new
            try {
                await conn.query(`
                    INSERT INTO manual_override_audit_log
                    (promo_code_id, code, action, old_status, new_status,
                     override_reason, admin_notes, admin_id, admin_name, admin_phone, device_ip)
                    VALUES (?, ?, 'replace_code', ?, 'replaced', ?, ?, ?, ?, ?, ?)
                `, [promo_code_id, oldCode.code, oldStatus, issue_reason || null,
                    note || null, adminId, adminName, adminPhone, device_ip || null]);

                await conn.query(`
                    INSERT INTO manual_override_audit_log
                    (promo_code_id, code, action, old_status, new_status,
                     override_reason, admin_notes, admin_id, admin_name, admin_phone, device_ip)
                    VALUES (?, ?, 'replace_code', 'active', 'active', ?, ?, ?, ?, ?, ?)
                `, [newCodeId, newCodeValue, issue_reason || null,
                    `ออกแทน #${promo_code_id}`, adminId, adminName, adminPhone, device_ip || null]);
            } catch (e) { console.warn('[replaceCode] audit log failed', e.message); }

            try {
                await conn.query(`
                    INSERT INTO promo_code_timeline
                    (promo_code_id, event_type, event_title, actor_type, actor_id, actor_name, event_timestamp, event_metadata)
                    VALUES (?, 'cancelled', 'ออกโค้ดใหม่แทน', 'admin', ?, ?, NOW(), ?)
                `, [promo_code_id, adminId, adminName, JSON.stringify({ new_code: newCodeValue, new_id: newCodeId, issue_reason })]);
            } catch (e) { console.warn('[replaceCode] timeline failed', e.message); }

            await conn.commit();
            return res.json({
                success: true,
                message: 'Code replaced successfully',
                data: {
                    old_code_id: Number(promo_code_id),
                    old_status: 'replaced',
                    new_code_id: newCodeId,
                    new_code: newCodeValue,
                    new_status: 'active'
                }
            });
        } catch (err) {
            await conn.rollback();
            throw err;
        }
    } catch (error) {
        console.error('Replace code error:', error);
        if (conn) conn.release();
        return res.status(500).json({ error: 'Failed to replace code' });
    } finally {
        if (conn) conn.release();
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// 5. RESET STATUS — general status change with audit trail
// ═══════════════════════════════════════════════════════════════════════════════

exports.resetCodeStatus = async (req, res) => {
    let conn;
    try {
        const { promo_code_id, new_status, override_reason, override_reason_custom, admin_notes, device_ip } = req.body;
        const adminId   = req.user?.user_id;
        const adminName = req.user?.full_name;
        const adminPhone = req.user?.phone_number;

        if (!promo_code_id || !adminId || !new_status) {
            return res.status(400).json({ error: 'promo_code_id, new_status, and admin credentials are required' });
        }

        // Accept both new and legacy status names
        const STATUS_MAP = {
            active: 'active', ready: 'active',
            redeemed: 'redeemed', manual_redeemed: 'redeemed',
            expired: 'expired',
            cancelled: 'cancelled',
            replaced: 'replaced'
        };
        const normalizedStatus = STATUS_MAP[new_status];
        if (!normalizedStatus) {
            return res.status(400).json({ error: `Invalid status: ${new_status}` });
        }

        conn = await pool.getConnection();
        await conn.beginTransaction();

        try {
            const [codeRows] = await conn.query(
                'SELECT * FROM promo_codes WHERE promo_code_id = ? FOR UPDATE',
                [promo_code_id]
            );
            if (!codeRows.length) {
                await conn.rollback();
                return res.status(404).json({ error: 'Promo code not found' });
            }
            const currentCode = codeRows[0];
            const oldStatus = computeStatus(currentCode);

            const setIsUsed = normalizedStatus === 'redeemed' ? 1 : 0;
            const setUsedAt = normalizedStatus === 'redeemed' ? 'NOW()' : 'NULL';
            const overrideFlag = normalizedStatus === 'active' ? 'NULL' : `'${normalizedStatus}'`;

            try {
                await conn.query(`
                    UPDATE promo_codes
                    SET status=?, is_used=?,
                        ${normalizedStatus === 'redeemed' ? 'used_at=NOW(),' : 'used_at=NULL,'}
                        override_flag=?,
                        last_updated_by=?, last_updated_at=NOW()
                    WHERE promo_code_id=?
                `, [
                    normalizedStatus,
                    setIsUsed,
                    normalizedStatus === 'active' ? null : normalizedStatus,
                    adminId,
                    promo_code_id
                ]);
            } catch (e) {
                await conn.query(
                    `UPDATE promo_codes SET is_used=? WHERE promo_code_id=?`,
                    [setIsUsed, promo_code_id]
                );
            }

            try {
                await conn.query(`
                    INSERT INTO manual_override_audit_log
                    (promo_code_id, code, action, old_status, new_status,
                     override_reason, override_reason_custom, admin_notes,
                     admin_id, admin_name, admin_phone, device_ip)
                    VALUES (?, ?, 'reset_status', ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [promo_code_id, currentCode.code, oldStatus, normalizedStatus,
                    override_reason || null, override_reason_custom || null,
                    admin_notes || null, adminId, adminName, adminPhone, device_ip || null]);
            } catch (e) { console.warn('[resetCodeStatus] audit log failed', e.message); }

            try {
                await conn.query(`
                    INSERT INTO promo_code_timeline
                    (promo_code_id, event_type, event_title, actor_type, actor_id, actor_name, event_timestamp, event_metadata)
                    VALUES (?, 'manual_override', ?, 'admin', ?, ?, NOW(), ?)
                `, [promo_code_id, `เปลี่ยนสถานะ → ${normalizedStatus}`,
                    adminId, adminName,
                    JSON.stringify({ from: oldStatus, to: normalizedStatus, reason: override_reason })]);
            } catch (e) { console.warn('[resetCodeStatus] timeline failed', e.message); }

            await conn.commit();
            return res.json({
                success: true,
                message: 'Code status updated successfully',
                data: { promo_code_id, old_status: oldStatus, new_status: normalizedStatus }
            });
        } catch (err) {
            await conn.rollback();
            throw err;
        }
    } catch (error) {
        console.error('Reset code status error:', error);
        if (conn) conn.release();
        return res.status(500).json({ error: 'Failed to reset code status' });
    } finally {
        if (conn) conn.release();
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// 6. FORCE REDEEM — kept for backward compat, delegates to confirmCode logic
// ═══════════════════════════════════════════════════════════════════════════════

exports.forceRedeemCode = async (req, res) => {
    req.body.note = req.body.admin_notes || req.body.note;
    return exports.confirmCode(req, res);
};

// ═══════════════════════════════════════════════════════════════════════════════
// 7. GET AUDIT LOG
// ═══════════════════════════════════════════════════════════════════════════════

exports.getAuditLog = async (req, res) => {
    let conn;
    try {
        const { admin_id, action, date_from, date_to, override_reason, search_code, promo_code_id, limit = 100, offset = 0 } = req.query;

        conn = await pool.getConnection();
        let logs = [], total = 0;

        try {
            const params = [];
            let where = 'WHERE 1=1';
            if (promo_code_id) { where += ' AND promo_code_id=?'; params.push(promo_code_id); }
            if (admin_id)      { where += ' AND admin_id=?';      params.push(admin_id); }
            if (action)        { where += ' AND action=?';        params.push(action); }
            if (override_reason) { where += ' AND override_reason=?'; params.push(override_reason); }
            if (search_code)   { where += ' AND code LIKE ?';     params.push(`%${search_code}%`); }
            if (date_from)     { where += ' AND action_timestamp >= ?'; params.push(`${date_from} 00:00:00`); }
            if (date_to)       { where += ' AND action_timestamp <= ?'; params.push(`${date_to} 23:59:59`); }

            const [[countRow]] = await conn.query(`SELECT COUNT(*) as total FROM manual_override_audit_log ${where}`, params);
            total = Number(countRow?.total || 0);

            const dataParams = [...params, parseInt(limit), parseInt(offset)];
            [logs] = await conn.query(
                `SELECT audit_log_id, promo_code_id, code, action, old_status, new_status,
                        override_reason, override_reason_custom, admin_id, admin_name, admin_phone,
                        branch_id, branch_name, admin_notes, device_ip, action_timestamp, is_critical
                 FROM manual_override_audit_log ${where}
                 ORDER BY action_timestamp DESC LIMIT ? OFFSET ?`,
                dataParams
            );
        } catch (e) {
            console.warn('[getAuditLog] query failed:', e.message);
        }

        conn.release();
        return res.json({ success: true, data: logs, total, limit: parseInt(limit), offset: parseInt(offset) });
    } catch (error) {
        console.error('Get audit log error:', error);
        if (conn) conn.release();
        return res.status(500).json({ error: 'Failed to get audit log' });
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// 8. EXPORT AUDIT LOG
// ═══════════════════════════════════════════════════════════════════════════════

exports.exportAuditLog = async (req, res) => {
    let conn;
    try {
        const { format = 'json', date_from, date_to, admin_id, promo_code_id } = req.query;
        conn = await pool.getConnection();
        let logs = [];

        try {
            const params = [];
            let where = 'WHERE 1=1';
            if (promo_code_id) { where += ' AND promo_code_id=?'; params.push(promo_code_id); }
            if (date_from)     { where += ' AND action_timestamp >= ?'; params.push(`${date_from} 00:00:00`); }
            if (date_to)       { where += ' AND action_timestamp <= ?'; params.push(`${date_to} 23:59:59`); }
            if (admin_id)      { where += ' AND admin_id=?'; params.push(admin_id); }
            [logs] = await conn.query(`SELECT * FROM manual_override_audit_log ${where} ORDER BY action_timestamp DESC`, params);
        } catch (e) {
            console.warn('[exportAuditLog] query failed:', e.message);
        }

        conn.release();

        if (format === 'csv') {
            const csvHeaders = ['Audit Log ID','Code','Action','Old Status','New Status','Reason','Admin Name','Admin Phone','Branch','Timestamp','Notes'];
            const csvRows = logs.map(l => [
                l.audit_log_id, l.code, l.action, l.old_status, l.new_status,
                l.override_reason, l.admin_name, l.admin_phone,
                l.branch_name || '', l.action_timestamp, l.admin_notes || ''
            ]);
            const csv = [
                csvHeaders.join(','),
                ...csvRows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g,'""')}"`).join(','))
            ].join('\n');
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="audit-log-${promo_code_id || 'all'}.csv"`);
            return res.send(csv);
        } else {
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Disposition', `attachment; filename="audit-log-${promo_code_id || 'all'}.json"`);
            return res.json({ exported_at: new Date(), total_records: logs.length, logs });
        }
    } catch (error) {
        console.error('Export audit log error:', error);
        if (conn) conn.release();
        return res.status(500).json({ error: 'Failed to export audit log' });
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// 9. OVERRIDE STATISTICS
// ═══════════════════════════════════════════════════════════════════════════════

exports.getOverrideStats = async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();
        let totalOverrides = 0, todayOverrides = 0;
        let overridesByAction = [], overridesByReason = [], overridesByAdmin = [];

        try {
            const [[totalRow]] = await conn.query(`SELECT COUNT(*) as count FROM manual_override_audit_log`);
            const [[todayRow]] = await conn.query(`SELECT COUNT(*) as count FROM manual_override_audit_log WHERE DATE(action_timestamp) = DATE(NOW())`);
            [overridesByAction] = await conn.query(`SELECT action, COUNT(*) as count FROM manual_override_audit_log GROUP BY action`);
            [overridesByReason] = await conn.query(`SELECT override_reason, COUNT(*) as count FROM manual_override_audit_log WHERE override_reason IS NOT NULL GROUP BY override_reason`);
            [overridesByAdmin]  = await conn.query(`SELECT admin_id, admin_name, COUNT(*) as count FROM manual_override_audit_log GROUP BY admin_id, admin_name ORDER BY count DESC LIMIT 10`);
            totalOverrides = Number(totalRow?.count || 0);
            todayOverrides = Number(todayRow?.count || 0);
        } catch (e) {
            console.warn('[getOverrideStats] query failed:', e.message);
        }

        conn.release();
        return res.json({
            success: true,
            data: { total_overrides: totalOverrides, today_overrides: todayOverrides, by_action: overridesByAction, by_reason: overridesByReason, top_admins: overridesByAdmin }
        });
    } catch (error) {
        console.error('Get override stats error:', error);
        if (conn) conn.release();
        return res.status(500).json({ error: 'Failed to get override statistics' });
    }
};
