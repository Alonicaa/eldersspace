const pool = require('../config/db');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Mask promo code so admin cannot read the full value.
// Shows first 2 + up to 6 asterisks + last 2 chars.
// e.g. LOTUS123456 → LO******56
function maskCode(code) {
  if (!code) return '';
  if (code.length <= 4) return '*'.repeat(code.length);
  const visible = Math.min(2, Math.floor(code.length / 4));
  return code.slice(0, visible) + '*'.repeat(Math.min(code.length - visible * 2, 6)) + code.slice(-visible);
}

// ─── Upload promo codes from JSON array (ส่งมาจาก frontend แบบ JSON) ───────
exports.uploadPromoCodes = async (req, res) => {
  let conn;
  try {
    const { codes } = req.body; // Array of { code, reward_id, description, expiry_date }

    if (!Array.isArray(codes) || codes.length === 0) {
      return res.status(400).json({ error: 'Codes array is required and cannot be empty' });
    }

    conn = await pool.connect();

    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    await conn.query('BEGIN');

    for (const codeData of codes) {
      try {
        const { code, reward_id, description, expiry_date } = codeData;

        if (!code || !reward_id) {
          errorCount++;
          errors.push({ code, error: 'Missing code or reward_id' });
          continue;
        }

        const reward = await conn.query(
          'SELECT reward_id FROM rewards WHERE reward_id = $1',
          [reward_id]
        );

        if (!reward.rows.length) {
          errorCount++;
          errors.push({ code, error: 'Reward not found' });
          continue;
        }

        const existing = await conn.query(
          'SELECT promo_code_id FROM promo_codes WHERE code = $1',
          [code]
        );

        if (existing.rows.length) {
          errorCount++;
          errors.push({ code, error: 'Code already exists' });
          continue;
        }

        // SAVEPOINT ก่อน insert ทุกครั้ง — ถ้าแถวนี้ error (เช่น expiry_date รูปแบบผิด)
        // จะ rollback แค่แถวนี้ ไม่ทำให้ทั้ง batch ก่อนหน้าที่สำเร็จแล้วหายไปตอน COMMIT
        await conn.query('SAVEPOINT sp_promo_code');
        try {
          await conn.query(
            `INSERT INTO promo_codes (code, reward_id, description, expiry_date)
             VALUES ($1, $2, $3, $4)`,
            [code, reward_id, description || null, expiry_date || null]
          );
          await conn.query('RELEASE SAVEPOINT sp_promo_code');
          successCount++;
        } catch (insertError) {
          await conn.query('ROLLBACK TO SAVEPOINT sp_promo_code');
          throw insertError;
        }
      } catch (error) {
        errorCount++;
        errors.push({ code: codeData.code, error: error.message });
      }
    }

    await conn.query('COMMIT');

    return res.json({
      success: true,
      message: `Uploaded ${successCount} codes, ${errorCount} failed`,
      successCount,
      errorCount,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    if (conn) await conn.query('ROLLBACK');
    console.error('Upload promo codes error:', error);
    return res.status(500).json({ error: 'Failed to upload promo codes' });
  } finally {
    if (conn) conn.release();
  }
};

// ─── Upload promo codes จาก CSV file (multipart/form-data) ──────────────────
// POST /api/admin/promo-codes/upload-csv
// Form fields: file (CSV), reward_id (number)
exports.uploadPromoCodesFromCsv = async (req, res) => {
  let conn;
  const csvFilePath = req.file ? req.file.path : null;

  try {
    if (!req.file) {
      return res.status(400).json({ error: 'กรุณาอัพโหลดไฟล์ CSV' });
    }

    const rewardId = parseInt(req.body.reward_id);
    if (!rewardId || isNaN(rewardId)) {
      if (csvFilePath) fs.unlink(csvFilePath, () => {});
      return res.status(400).json({ error: 'กรุณาระบุ reward_id' });
    }

    // Parse CSV file
    const fileContent = fs.readFileSync(csvFilePath, 'utf-8');
    const lines = fileContent
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0);

    if (lines.length < 2) {
      if (csvFilePath) fs.unlink(csvFilePath, () => {});
      return res.status(400).json({ error: 'ไฟล์ CSV ว่างเปล่าหรือไม่มีข้อมูล' });
    }

    // Parse header row
    const headerLine = lines[0];
    const headers = headerLine.split(',').map(h => h.trim().toLowerCase().replace(/['"]/g, ''));

    const codeIdx = headers.findIndex(h => h === 'code');
    const descIdx = headers.findIndex(h => ['description', 'desc'].includes(h));
    const expiryIdx = headers.findIndex(h => ['expiry_date', 'expiry', 'expires_at'].includes(h));

    if (codeIdx === -1) {
      if (csvFilePath) fs.unlink(csvFilePath, () => {});
      return res.status(400).json({
        error: 'ไม่พบ column "code" ในไฟล์ CSV กรุณาตรวจสอบ header'
      });
    }

    // Parse data rows
    const codes = [];
    const batchId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const uploadedAt = new Date();

    for (let i = 1; i < lines.length; i++) {
      const cols = parseCsvLine(lines[i]);
      const code = cols[codeIdx] ? cols[codeIdx].trim() : '';
      if (!code) continue;

      codes.push({
        code,
        reward_id: rewardId,
        description: descIdx !== -1 ? (cols[descIdx] || '').trim() || null : null,
        expiry_date: expiryIdx !== -1 ? (cols[expiryIdx] || '').trim() || null : null,
        batch_upload_id: batchId,
        uploaded_at: uploadedAt,
      });
    }

    if (codes.length === 0) {
      if (csvFilePath) fs.unlink(csvFilePath, () => {});
      return res.status(400).json({ error: 'ไม่พบข้อมูลโค้ดในไฟล์' });
    }

    // Compute file fingerprint (SHA-256 of sorted code list, first 32 chars)
    const fileHash = crypto
      .createHash('sha256')
      .update(codes.map(c => c.code.toLowerCase()).sort().join('\n'))
      .digest('hex')
      .slice(0, 32);

    // Verify reward exists and check for duplicate file upload
    conn = await pool.connect();
    const reward = await conn.query(
      'SELECT reward_id, reward_name FROM rewards WHERE reward_id = $1',
      [rewardId]
    );

    if (!reward.rows.length) {
      if (csvFilePath) fs.unlink(csvFilePath, () => {});
      conn.release();
      return res.status(404).json({ error: 'ไม่พบรางวัลที่ระบุ' });
    }

    // Check if this exact file was uploaded before for this reward
    const dupFile = await conn.query(
      `SELECT batch_upload_id, uploaded_at
       FROM promo_codes
       WHERE reward_id = $1 AND file_hash = $2 AND is_deleted = 0
       LIMIT 1`,
      [rewardId, fileHash]
    );

    if (dupFile.rows.length > 0) {
      if (csvFilePath) fs.unlink(csvFilePath, () => {});
      conn.release();
      const prevDate = dupFile.rows[0].uploaded_at
        ? new Date(dupFile.rows[0].uploaded_at).toLocaleDateString('th-TH', {
            year: 'numeric', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit'
          })
        : 'ไม่ทราบวันที่';
      return res.status(409).json({
        error: `ไฟล์นี้เคยอัพโหลดไว้แล้วสำหรับรางวัลนี้ (อัพโหลดครั้งก่อน: ${prevDate})`,
        fileAlreadyUploaded: true,
        previousUploadDate: dupFile.rows[0].uploaded_at
      });
    }

    // Pre-fetch existing codes for this reward (for per-code duplicate reporting)
    const existingRewardRows = await conn.query(
      'SELECT code FROM promo_codes WHERE reward_id = $1 AND is_deleted = 0',
      [rewardId]
    );
    const existingRewardCodeSet = new Set(existingRewardRows.rows.map(r => r.code));

    // Insert codes
    let successCount = 0;
    let errorCount = 0;
    let duplicateInRewardCount = 0;
    const errors = [];
    const duplicateCodesInReward = [];

    await conn.query('BEGIN');

    for (const codeData of codes) {
      try {
        if (existingRewardCodeSet.has(codeData.code)) {
          errorCount++;
          duplicateInRewardCount++;
          duplicateCodesInReward.push(codeData.code);
          errors.push({ code: codeData.code, error: 'โค้ดซ้ำกับที่อัพโหลดไว้แล้วสำหรับรางวัลนี้', type: 'duplicate_reward' });
          continue;
        }

        // SAVEPOINT ก่อนแตะ DB ทุกครั้ง — ถ้าแถวนี้ error (เช่น expiry_date รูปแบบผิด,
        // unique constraint ชน) จะ rollback แค่แถวนี้ ไม่ทำให้ทั้ง batch ก่อนหน้าที่
        // สำเร็จแล้วหายไปเงียบๆ ตอน COMMIT (Postgres จะเปลี่ยน COMMIT เป็น ROLLBACK
        // ทั้งก้อนถ้า transaction เข้า state aborted แต่ไม่ throw error ให้เห็น)
        await conn.query('SAVEPOINT sp_promo_csv_row');
        try {
          // Check global duplicate (same code text used in a different reward)
          const existing = await conn.query(
            'SELECT promo_code_id FROM promo_codes WHERE code = $1 AND is_deleted = 0',
            [codeData.code]
          );
          if (existing.rows.length) {
            await conn.query('RELEASE SAVEPOINT sp_promo_csv_row');
            errorCount++;
            errors.push({ code: codeData.code, error: 'โค้ดนี้มีอยู่แล้วในระบบ (รางวัลอื่น)', type: 'duplicate_other' });
            continue;
          }

          await conn.query(
            `INSERT INTO promo_codes
               (code, reward_id, description, expiry_date, batch_upload_id, uploaded_at, file_hash)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              codeData.code, codeData.reward_id, codeData.description,
              codeData.expiry_date, codeData.batch_upload_id, codeData.uploaded_at, fileHash
            ]
          );
          await conn.query('RELEASE SAVEPOINT sp_promo_csv_row');
          successCount++;
        } catch (insertError) {
          await conn.query('ROLLBACK TO SAVEPOINT sp_promo_csv_row');
          throw insertError;
        }
      } catch (err) {
        errorCount++;
        errors.push({ code: codeData.code, error: err.message, type: 'insert_error' });
      }
    }

    await conn.query('COMMIT');
    if (csvFilePath) fs.unlink(csvFilePath, () => {});

    const insertErrors = errors.filter(e => e.type === 'insert_error');

    return res.json({
      success: true,
      message: `อัพโหลดสำเร็จ ${successCount} โค้ด, ล้มเหลว ${errorCount} โค้ด`,
      successCount,
      errorCount,
      duplicateInRewardCount,
      duplicateCodesInReward: duplicateCodesInReward.length > 0 ? duplicateCodesInReward.slice(0, 50) : undefined,
      totalParsed: codes.length,
      reward_name: reward.rows[0].reward_name,
      errors: insertErrors.length > 0 ? insertErrors.slice(0, 20) : undefined
    });
  } catch (error) {
    if (conn) await conn.query('ROLLBACK');
    if (csvFilePath) fs.unlink(csvFilePath, () => {});
    console.error('Upload CSV promo codes error:', error);
    return res.status(500).json({ error: 'เกิดข้อผิดพลาดในการอัพโหลด CSV: ' + error.message });
  } finally {
    if (conn) conn.release();
  }
};

// Helper: parse a single CSV line (handles quoted fields)
function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

// ─── Get all promo codes with filters ────────────────────────────────────────
exports.getPromoCodes = async (req, res) => {
  let conn;
  try {
    const { search, status, reward_id, used_from, used_to, limit = 100, offset = 0 } = req.query;
    console.log('[getPromoCodes] query', { search, status, reward_id, used_from, used_to, limit, offset });

    conn = await pool.connect();

    let query = `
      SELECT
        p.promo_code_id,
        p.code,
        p.reward_id,
        r.reward_name,
        r.required_points AS reward_points,
        p.description,
        p.expiry_date,
        p.is_used,
        p.used_by_phone,
        p.used_by_user_id,
        p.used_at,
        p.created_at,
        p.batch_upload_id,
        p.uploaded_at,
        p.override_flag,
        p.last_updated_by,
        p.last_updated_at,
        u_admin.full_name AS last_updated_by_name,
        CASE
          WHEN p.override_flag IN ('cancelled','replaced','refunded') THEN p.override_flag
          WHEN p.override_flag = 'manual_redeemed' THEN 'manual_redeemed'
          WHEN p.is_used = 1 OR p.status = 'redeemed' THEN 'redeemed'
          WHEN p.expiry_date IS NOT NULL AND p.expiry_date < NOW() THEN 'expired'
          ELSE 'available'
        END as current_status,
        CASE
          WHEN p.is_used = 1 THEN 'used'
          WHEN p.expiry_date IS NOT NULL AND p.expiry_date < NOW() THEN 'expired'
          ELSE 'available'
        END as status
      FROM promo_codes p
      LEFT JOIN rewards r ON p.reward_id = r.reward_id
      LEFT JOIN users u_admin ON p.last_updated_by = u_admin.user_id
      WHERE p.is_deleted = 0
    `;

    const params = [];
    let pi = 1;

    if (search) {
      query += ` AND p.code LIKE $${pi++}`;
      params.push(`%${search}%`);
    }

    if (status === 'available') {
      query += ' AND p.is_used = 0 AND (p.expiry_date IS NULL OR p.expiry_date >= NOW())';
    } else if (status === 'used') {
      query += ' AND p.is_used = 1';
    } else if (status === 'expired') {
      query += ' AND p.expiry_date < NOW()';
    }

    if (reward_id) {
      query += ` AND p.reward_id = $${pi++}`;
      params.push(reward_id);
    }

    if (used_from) {
      query += ` AND p.used_at >= $${pi++}`;
      params.push(`${used_from} 00:00:00`);
    }

    if (used_to) {
      query += ` AND p.used_at <= $${pi++}`;
      params.push(`${used_to} 23:59:59`);
    }

    query += ` ORDER BY p.created_at DESC LIMIT $${pi++} OFFSET $${pi++}`;
    params.push(parseInt(limit), parseInt(offset));

    const codesResult = await conn.query(query, params);
    const codes = codesResult.rows;
    console.log('[getPromoCodes] rows', codes.length);

    let countQuery = 'SELECT COUNT(*) as total FROM promo_codes WHERE is_deleted = 0';
    const countParams = [];
    let cpi = 1;

    if (search) {
      countQuery += ` AND code LIKE $${cpi++}`;
      countParams.push(`%${search}%`);
    }

    if (status === 'available') {
      countQuery += ' AND is_used = 0 AND (expiry_date IS NULL OR expiry_date >= NOW())';
    } else if (status === 'used') {
      countQuery += ' AND is_used = 1';
    } else if (status === 'expired') {
      countQuery += ' AND expiry_date < NOW()';
    }

    if (reward_id) {
      countQuery += ` AND reward_id = $${cpi++}`;
      countParams.push(reward_id);
    }

    if (used_from) {
      countQuery += ` AND used_at >= $${cpi++}`;
      countParams.push(`${used_from} 00:00:00`);
    }

    if (used_to) {
      countQuery += ` AND used_at <= $${cpi++}`;
      countParams.push(`${used_to} 23:59:59`);
    }

    const countResult = await conn.query(countQuery, countParams);
    console.log('[getPromoCodes] count', countResult.rows[0]?.total);
    const total = Number(countResult.rows[0]?.total || 0);

    // Convert BigInt values and mask the full code from admin view
    const codesWithConvertedTypes = codes.map(code => ({
      ...code,
      code: maskCode(code.code),
      reward_id: Number(code.reward_id),
      promo_code_id: Number(code.promo_code_id),
      reward_points: Number(code.reward_points || 0),
      used_by_user_id: code.used_by_user_id ? Number(code.used_by_user_id) : null
    }));

    conn.release();

    return res.json({
      success: true,
      data: codesWithConvertedTypes,
      total,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('Get promo codes error:', error);
    if (conn) conn.release();
    return res.status(500).json({
      error: 'Failed to get promo codes',
      detail: process.env.NODE_ENV === 'production' ? undefined : error.message
    });
  }
};

// ─── Use promo code (when user redeems reward) ────────────────────────────────
exports.usePromoCode = async (req, res) => {
  let conn;
  try {
    const { code, user_id, phone_number } = req.body;

    if (!code || !user_id || !phone_number) {
      return res.status(400).json({ error: 'Code, user_id, and phone_number are required' });
    }

    conn = await pool.connect();
    await conn.query('BEGIN');

    const promoCode = await conn.query(
      `SELECT * FROM promo_codes WHERE code = $1 AND is_deleted = 0 FOR UPDATE`,
      [code]
    );

    if (!promoCode.rows.length) {
      await conn.query('ROLLBACK');
      conn.release();
      return res.status(404).json({ error: 'Promo code not found' });
    }

    const promo = promoCode.rows[0];

    if (promo.is_used === 1) {
      await conn.query('ROLLBACK');
      conn.release();
      return res.status(400).json({ error: 'Code already used' });
    }

    if (promo.expiry_date && new Date(promo.expiry_date) < new Date()) {
      await conn.query('ROLLBACK');
      conn.release();
      return res.status(400).json({ error: 'Code has expired' });
    }

    await conn.query(
      `UPDATE promo_codes SET is_used = 1, used_by_user_id = $1, used_by_phone = $2, used_at = NOW()
       WHERE promo_code_id = $3`,
      [user_id, phone_number, promo.promo_code_id]
    );

    await conn.query(
      `INSERT INTO promo_code_logs (promo_code_id, code, action, user_id, phone_number, status, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [promo.promo_code_id, code, 'use', user_id, phone_number, 'success', JSON.stringify({ used_at: new Date() })]
    );

    await conn.query('COMMIT');
    conn.release();

    return res.json({
      success: true,
      message: 'Code used successfully',
      reward_id: promo.reward_id
    });
  } catch (error) {
    if (conn) {
      await conn.query('ROLLBACK');
      conn.release();
    }
    console.error('Use promo code error:', error);
    return res.status(500).json({ error: 'Failed to use promo code' });
  }
};

// ─── Delete promo codes ───────────────────────────────────────────────────────
exports.deletePromoCodes = async (req, res) => {
  let conn;
  try {
    const { codes } = req.body;

    if (!Array.isArray(codes) || codes.length === 0) {
      return res.status(400).json({ error: 'Codes array is required' });
    }

    conn = await pool.connect();

    for (const code of codes) {
      await conn.query('UPDATE promo_codes SET is_deleted = 1 WHERE code = $1', [code]);
    }

    conn.release();

    return res.json({
      success: true,
      message: `Deleted ${codes.length} codes`
    });
  } catch (error) {
    console.error('Delete promo codes error:', error);
    if (conn) conn.release();
    return res.status(500).json({ error: 'Failed to delete promo codes' });
  }
};

// ─── Get promo code stats ─────────────────────────────────────────────────────
exports.getPromoStats = async (req, res) => {
  let conn;
  try {
    conn = await pool.connect();

    const stats = await conn.query(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN is_used = 0 AND (expiry_date IS NULL OR expiry_date >= NOW()) THEN 1 ELSE 0 END) as available,
        SUM(CASE WHEN is_used = 1 THEN 1 ELSE 0 END) as used,
        SUM(CASE WHEN expiry_date < NOW() THEN 1 ELSE 0 END) as expired
      FROM promo_codes
      WHERE is_deleted = 0
    `);

    conn.release();

    return res.json({
      success: true,
      data: stats.rows[0] || { total: 0, available: 0, used: 0, expired: 0 }
    });
  } catch (error) {
    console.error('Get promo stats error:', error);
    if (conn) conn.release();
    return res.status(500).json({ error: 'Failed to get promo stats' });
  }
};

// ─── Admin: cleanup expired promo codes (delete unused expired codes) ───────
exports.cleanupExpiredPromoCodes = async (req, res) => {
  let conn;
  try {
    const { older_than_days } = req.body || {};

    conn = await pool.connect();

    let where = 'expiry_date < NOW() AND is_used = 0';
    const params = [];
    let pi = 1;

    if (older_than_days && Number(older_than_days) > 0) {
      where = `expiry_date < NOW() - INTERVAL '${parseInt(older_than_days, 10)} days' AND is_used = 0`;
    }

    const countRes = await conn.query(`SELECT COUNT(*) AS n FROM promo_codes WHERE ${where} AND is_deleted = 0`, params);
    const toDelete = Number(countRes.rows[0]?.n || 0);

    if (toDelete === 0) {
      conn.release();
      return res.json({ success: true, deleted: 0, message: 'No expired unused promo codes found' });
    }

    await conn.query(`UPDATE promo_codes SET is_deleted = 1 WHERE ${where} AND is_deleted = 0`, params);

    conn.release();

    return res.json({ success: true, deleted: toDelete });
  } catch (error) {
    console.error('Cleanup expired promo codes error:', error);
    if (conn) conn.release();
    return res.status(500).json({ error: 'Failed to cleanup expired promo codes' });
  }
};

// ─── Admin: update promo code status (mark used/unuse, adjust used_by fields) ─
exports.updatePromoCodeStatus = async (req, res) => {
  let conn;
  try {
    const { id } = req.params; // promo_code_id
    const { is_used, used_by_user_id, used_by_phone, used_at, note } = req.body;

    if (!id) return res.status(400).json({ error: 'promo_code id is required' });

    conn = await pool.connect();
    await conn.query('BEGIN');

    const rows = await conn.query('SELECT * FROM promo_codes WHERE promo_code_id = $1 FOR UPDATE', [id]);
    if (!rows.rows.length) {
      await conn.query('ROLLBACK');
      conn.release();
      return res.status(404).json({ error: 'Promo code not found' });
    }

    const updates = [];
    const params = [];
    let pi = 1;

    if (typeof is_used !== 'undefined') {
      updates.push(`is_used = $${pi++}`);
      params.push(Number(is_used) ? 1 : 0);
    }

    if (typeof used_by_user_id !== 'undefined') {
      updates.push(`used_by_user_id = $${pi++}`);
      params.push(used_by_user_id || null);
    }

    if (typeof used_by_phone !== 'undefined') {
      updates.push(`used_by_phone = $${pi++}`);
      params.push(used_by_phone || null);
    }

    if (typeof used_at !== 'undefined') {
      updates.push(`used_at = $${pi++}`);
      params.push(used_at || null);
    }

    if (updates.length) {
      params.push(id);
      await conn.query(`UPDATE promo_codes SET ${updates.join(', ')} WHERE promo_code_id = $${pi}`, params);
    }

    // Add a log entry for audit
    await conn.query(
      `INSERT INTO promo_code_logs (promo_code_id, code, action, user_id, phone_number, status, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [rows.rows[0].promo_code_id, rows.rows[0].code, 'admin_update_status', used_by_user_id || null, used_by_phone || null, 'success', JSON.stringify({ note: note || null, changed_by_admin: true })]
    );

    await conn.query('COMMIT');
    conn.release();

    return res.json({ success: true, message: 'Promo code status updated' });
  } catch (error) {
    console.error('Update promo code status error:', error);
    if (conn) {
      await conn.query('ROLLBACK');
      conn.release();
    }
    return res.status(500).json({ error: 'Failed to update promo code status' });
  }
};

// ─── Admin: replace a user's code with another available code ───────────────
exports.replacePromoCodeForUser = async (req, res) => {
  let conn;
  try {
    const { id } = req.params; // broken promo_code_id
    const { replacement_promo_code_id, user_id, phone_number, note } = req.body;

    if (!id || !replacement_promo_code_id || !user_id) {
      return res.status(400).json({ error: 'promo_code id, replacement_promo_code_id and user_id are required' });
    }

    conn = await pool.connect();
    await conn.query('BEGIN');

    // Lock both rows
    const oldRows = await conn.query('SELECT * FROM promo_codes WHERE promo_code_id = $1 FOR UPDATE', [id]);
    if (!oldRows.rows.length) {
      await conn.query('ROLLBACK');
      conn.release();
      return res.status(404).json({ error: 'Original promo code not found' });
    }

    const replacementRows = await conn.query('SELECT * FROM promo_codes WHERE promo_code_id = $1 FOR UPDATE', [replacement_promo_code_id]);
    if (!replacementRows.rows.length) {
      await conn.query('ROLLBACK');
      conn.release();
      return res.status(404).json({ error: 'Replacement promo code not found' });
    }

    const replacement = replacementRows.rows[0];
    if (replacement.is_used === 1) {
      await conn.query('ROLLBACK');
      conn.release();
      return res.status(400).json({ error: 'Replacement promo code is already used' });
    }

    if (replacement.expiry_date && new Date(replacement.expiry_date) < new Date()) {
      await conn.query('ROLLBACK');
      conn.release();
      return res.status(400).json({ error: 'Replacement promo code has expired' });
    }

    // Assign replacement to user
    await conn.query(
      `UPDATE promo_codes SET is_used = 1, used_by_user_id = $1, used_by_phone = $2, used_at = NOW() WHERE promo_code_id = $3`,
      [user_id, phone_number || null, replacement_promo_code_id]
    );

    // Log replacement assign
    await conn.query(
      `INSERT INTO promo_code_logs (promo_code_id, code, action, user_id, phone_number, status, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [replacement.promo_code_id, replacement.code, 'admin_replace_assign', user_id, phone_number || null, 'success', JSON.stringify({ replaced_old_promo_code_id: id, note: note || null })]
    );

    // Log original as replaced (audit)
    await conn.query(
      `INSERT INTO promo_code_logs (promo_code_id, code, action, status, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [oldRows.rows[0].promo_code_id, oldRows.rows[0].code, 'admin_mark_replaced', 'success', JSON.stringify({ replaced_by_promo_code_id: replacement.promo_code_id, note: note || null })]
    );

    await conn.query('COMMIT');
    conn.release();

    return res.json({ success: true, message: 'Replacement assigned', replacement: { promo_code_id: replacement.promo_code_id, code: maskCode(replacement.code) } });
  } catch (error) {
    console.error('Replace promo code error:', error);
    if (conn) {
      await conn.query('ROLLBACK');
      conn.release();
    }
    return res.status(500).json({ error: 'Failed to replace promo code' });
  }
};

// ─── Internal: assign available promo code when user redeems reward ───────────
exports.assignPromoCodeForReward = async (conn, rewardId, userId, phoneNumber) => {
  try {
    const availableCode = await conn.query(
      `SELECT promo_code_id, code, reward_id, description, expiry_date
       FROM promo_codes
       WHERE reward_id = $1
         AND is_used = 0
         AND is_deleted = 0
         AND (expiry_date IS NULL OR expiry_date >= NOW())
       ORDER BY created_at ASC
       LIMIT 1
       FOR UPDATE`,
      [rewardId]
    );

    if (!availableCode.rows || availableCode.rows.length === 0) {
      return null;
    }

    const promoCode = availableCode.rows[0];

    await conn.query(
      `UPDATE promo_codes
       SET is_used = 1, used_by_user_id = $1, used_by_phone = $2, used_at = NOW()
       WHERE promo_code_id = $3`,
      [userId, phoneNumber, promoCode.promo_code_id]
    );

    await conn.query(
      `INSERT INTO promo_code_logs (promo_code_id, code, action, user_id, phone_number, status, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [promoCode.promo_code_id, promoCode.code, 'assign', userId, phoneNumber, 'success', JSON.stringify({ used_at: new Date() })]
    );

    return {
      promo_code_id: promoCode.promo_code_id,
      code: promoCode.code,
      reward_id: promoCode.reward_id,
      description: promoCode.description,
      expiry_date: promoCode.expiry_date
    };
  } catch (error) {
    console.error('Assign promo code error:', error);
    return null;
  }
};

// ─── Check available promo codes count for a reward ──────────────────────────
exports.getAvailablePromoCodeForReward = async (rewardId) => {
  let conn;
  try {
    conn = await pool.connect();

    const availableCode = await conn.query(
      `SELECT COUNT(*) as available
       FROM promo_codes
       WHERE reward_id = $1
         AND is_used = 0
         AND is_deleted = 0
         AND (expiry_date IS NULL OR expiry_date >= NOW())`,
      [rewardId]
    );

    conn.release();

    return (availableCode.rows[0]?.available || 0) > 0;
  } catch (error) {
    console.error('Get available promo code error:', error);
    if (conn) conn.release();
    return false;
  }
};

// ═════════════════════════════════════════════════════════════════════════════
// ════════════════════ CAMPAIGN MANAGEMENT FUNCTIONS ═════════════════════════
// ═════════════════════════════════════════════════════════════════════════════

// ─── Create a new promo campaign ─────────────────────────────────────────────
exports.createPromoCampaign = async (req, res) => {
  let conn;
  try {
    const { reward_id, campaign_name, campaign_start_date, campaign_end_date, description, max_codes } = req.body;

    if (!reward_id || !campaign_name || !campaign_start_date || !campaign_end_date) {
      return res.status(400).json({ error: 'กรุณาระบุ reward_id, campaign_name, campaign_start_date, campaign_end_date' });
    }

    const maxCodesValue = max_codes && Number(max_codes) > 0 ? Number(max_codes) : null;

    conn = await pool.connect();

    // Verify reward exists
    const reward = await conn.query(
      'SELECT reward_id, reward_name FROM rewards WHERE reward_id = $1',
      [reward_id]
    );

    if (!reward.rows.length) {
      conn.release();
      return res.status(404).json({ error: 'ไม่พบรางวัลที่ระบุ' });
    }

    // Create campaign
    const result = await conn.query(
      `INSERT INTO promo_campaigns (reward_id, campaign_name, campaign_start_date, campaign_end_date, description, max_codes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING campaign_id`,
      [reward_id, campaign_name, campaign_start_date, campaign_end_date, description || null, maxCodesValue]
    );

    conn.release();

    return res.json({
      success: true,
      message: 'สร้างแคมเปญสำเร็จ',
      campaign_id: result.rows[0].campaign_id,
      campaign_name: campaign_name,
      reward_name: reward.rows[0].reward_name
    });
  } catch (error) {
    console.error('Create campaign error:', error);
    if (conn) conn.release();
    return res.status(500).json({ error: 'เกิดข้อผิดพลาดในการสร้างแคมเปญ' });
  }
};

// ─── Get all promo campaigns for a reward ────────────────────────────────────
exports.getPromoCampaigns = async (req, res) => {
  let conn;
  try {
    const { reward_id } = req.query;

    conn = await pool.connect();

    let query = `
      SELECT
        c.campaign_id,
        c.reward_id,
        c.campaign_name,
        c.campaign_start_date,
        c.campaign_end_date,
        c.description,
        c.is_active,
        c.max_codes,
        r.reward_name,
        COUNT(DISTINCT p.promo_code_id) as total_codes,
        SUM(CASE WHEN p.is_used = 0 AND (p.expiry_date IS NULL OR p.expiry_date >= NOW()) AND p.is_deleted = 0 THEN 1 ELSE 0 END) as available_codes,
        SUM(CASE WHEN p.is_used = 1 AND p.is_deleted = 0 THEN 1 ELSE 0 END) as used_codes,
        c.created_at,
        c.updated_at
      FROM promo_campaigns c
      LEFT JOIN rewards r ON c.reward_id = r.reward_id
      LEFT JOIN promo_codes p ON c.campaign_id = p.campaign_id AND p.is_deleted = 0
      WHERE 1=1
    `;

    const params = [];
    let pi = 1;

    if (reward_id) {
      query += ` AND c.reward_id = $${pi++}`;
      params.push(reward_id);
    }

    query += ' GROUP BY c.campaign_id, r.reward_name ORDER BY c.campaign_start_date DESC';

    const campaigns = await conn.query(query, params);
    conn.release();

    return res.json({
      success: true,
      data: campaigns.rows.map(c => {
        const available = Number(c.available_codes || 0);
        const maxCodes = c.max_codes ? Number(c.max_codes) : null;
        const lowStockThreshold = maxCodes ? Math.max(10, Math.ceil(maxCodes * 0.1)) : 10;
        return {
          ...c,
          reward_id: Number(c.reward_id),
          campaign_id: Number(c.campaign_id),
          total_codes: Number(c.total_codes || 0),
          available_codes: available,
          used_codes: Number(c.used_codes || 0),
          max_codes: maxCodes,
          low_stock: available <= lowStockThreshold,
          quota_full: maxCodes !== null && Number(c.total_codes || 0) >= maxCodes
        };
      })
    });
  } catch (error) {
    console.error('Get campaigns error:', error);
    if (conn) conn.release();
    return res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงแคมเปญ' });
  }
};

// ─── Get campaign details with all codes ──────────────────────────────────────
exports.getCampaignDetails = async (req, res) => {
  let conn;
  try {
    const { campaign_id } = req.params;
    const { search, status } = req.query;

    conn = await pool.connect();

    // Get campaign info
    const campaign = await conn.query(
      `SELECT c.*, r.reward_name
       FROM promo_campaigns c
       LEFT JOIN rewards r ON c.reward_id = r.reward_id
       WHERE c.campaign_id = $1`,
      [campaign_id]
    );

    if (!campaign.rows.length) {
      conn.release();
      return res.status(404).json({ error: 'ไม่พบแคมเปญ' });
    }

    // Get codes for this campaign
    let query = `
      SELECT
        p.promo_code_id,
        p.code,
        p.reward_id,
        p.description,
        p.expiry_date,
        p.is_used,
        p.used_by_phone,
        p.used_at,
        p.uploaded_at,
        p.batch_upload_id,
        p.created_at,
        CASE
          WHEN p.is_used = 1 THEN 'used'
          WHEN p.expiry_date < NOW() THEN 'expired'
          ELSE 'available'
        END as status
      FROM promo_codes p
      WHERE p.campaign_id = $1 AND p.is_deleted = 0
    `;

    const params = [campaign_id];
    let pi = 2;

    if (search) {
      query += ` AND p.code LIKE $${pi++}`;
      params.push(`%${search}%`);
    }

    if (status === 'available') {
      query += ' AND p.is_used = 0 AND (p.expiry_date IS NULL OR p.expiry_date >= NOW())';
    } else if (status === 'used') {
      query += ' AND p.is_used = 1';
    } else if (status === 'expired') {
      query += ' AND p.expiry_date < NOW()';
    }

    query += ' ORDER BY p.uploaded_at DESC, p.created_at ASC';

    const codesResult = await conn.query(query, params);
    const codes = codesResult.rows;

    // Group codes by upload batch
    const batches = {};
    codes.forEach(code => {
      const batchId = code.batch_upload_id || code.uploaded_at?.toISOString().split('T')[0] || 'unknown';
      if (!batches[batchId]) {
        batches[batchId] = {
          batch_id: batchId,
          uploaded_at: code.uploaded_at,
          codes: []
        };
      }
      batches[batchId].codes.push(code);
    });

    conn.release();

    // Mask codes before returning to admin
    const maskedBatches = Object.values(batches).map(b => ({
      ...b,
      codes: b.codes.map(c => ({ ...c, code: maskCode(c.code) }))
    }));

    return res.json({
      success: true,
      campaign: campaign.rows[0],
      total_codes: codes.length,
      batches: maskedBatches
    });
  } catch (error) {
    console.error('Get campaign details error:', error);
    if (conn) conn.release();
    return res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงรายละเอียดแคมเปญ' });
  }
};

// ─── Search promo codes by code or redemption date ──────────────────────────
exports.searchPromoCodesByCampaign = async (req, res) => {
  let conn;
  try {
    const { campaign_id, search_code, used_from_date, used_to_date } = req.query;

    if (!campaign_id) {
      return res.status(400).json({ error: 'กรุณาระบุ campaign_id' });
    }

    conn = await pool.connect();

    let query = `
      SELECT
        p.promo_code_id,
        p.code,
        p.description,
        p.expiry_date,
        p.is_used,
        p.used_by_phone,
        p.used_at,
        p.uploaded_at,
        p.created_at,
        CASE
          WHEN p.is_used = 1 THEN 'used'
          WHEN p.expiry_date < NOW() THEN 'expired'
          ELSE 'available'
        END as status
      FROM promo_codes p
      WHERE p.campaign_id = $1 AND p.is_deleted = 0
    `;

    const params = [campaign_id];
    let pi = 2;

    if (search_code) {
      query += ` AND p.code LIKE $${pi++}`;
      params.push(`%${search_code}%`);
    }

    if (used_from_date) {
      query += ` AND p.used_at >= $${pi++}`;
      params.push(used_from_date);
    }

    if (used_to_date) {
      query += ` AND p.used_at <= $${pi++}`;
      params.push(used_to_date);
    }

    query += ' ORDER BY p.used_at DESC, p.code ASC';

    const codesResult = await conn.query(query, params);
    conn.release();

    return res.json({
      success: true,
      data: codesResult.rows.map(c => ({ ...c, code: maskCode(c.code) })),
      total: codesResult.rows.length
    });
  } catch (error) {
    console.error('Search promo codes error:', error);
    if (conn) conn.release();
    return res.status(500).json({ error: 'เกิดข้อผิดพลาดในการค้นหา' });
  }
};
