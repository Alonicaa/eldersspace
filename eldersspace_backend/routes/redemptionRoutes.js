const router = require('express').Router();
const pool = require('../config/db');

// Get all redemptions with filters
router.get('/redemptions', async (req, res) => {
  let conn;
  try {
    const { search, status, reward_id, date_from, date_to, page = 1, limit = 50 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    conn = await pool.connect();

    // Flip to 'expired' any pending redemption whose 60-min window passed
    await conn.query(
      `UPDATE reward_redemption_history
       SET redemption_status = 'expired', updated_at = NOW()
       WHERE redemption_status = 'pending' AND expires_at < NOW()`
    );

    let query = `
      SELECT
        rh.redemption_id,
        rh.user_id,
        rh.phone_number,
        u.full_name as user_name,
        rh.reward_id,
        rh.reward_name,
        rh.points_redeemed,
        rh.redemption_status,
        rh.qr_code,
        rh.redeemed_at,
        rh.used_at,
        rh.expires_at,
        r.usage_instructions
      FROM reward_redemption_history rh
      LEFT JOIN users u ON rh.user_id = u.user_id
      LEFT JOIN rewards r ON rh.reward_id = r.reward_id
      WHERE 1=1
    `;

    const params = [];
    let pi = 1;

    if (search) {
      query += ` AND (rh.phone_number LIKE $${pi} OR u.full_name LIKE $${pi + 1} OR rh.reward_name LIKE $${pi + 2})`;
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
      pi += 3;
    }

    if (status) {
      query += ` AND rh.redemption_status = $${pi++}`;
      params.push(status);
    }

    if (reward_id) {
      query += ` AND rh.reward_id = $${pi++}`;
      params.push(reward_id);
    }

    if (date_from) {
      query += ` AND CURRENT_DATE >= $${pi++}`;
      params.push(date_from);
    }

    if (date_to) {
      query += ` AND CURRENT_DATE <= $${pi++}`;
      params.push(date_to);
    }

    query += ` ORDER BY rh.redeemed_at DESC LIMIT $${pi++} OFFSET $${pi++}`;
    params.push(parseInt(limit), offset);

    const redemptionsResult = await conn.query(query, params);
    const redemptions = redemptionsResult.rows;

    // Get total count
    let countQuery = `SELECT COUNT(*) as total FROM reward_redemption_history rh LEFT JOIN users u ON rh.user_id = u.user_id WHERE 1=1`;
    const countParams = [];
    let cpi = 1;

    if (search) {
      countQuery += ` AND (rh.phone_number LIKE $${cpi} OR u.full_name LIKE $${cpi + 1} OR rh.reward_name LIKE $${cpi + 2})`;
      const searchTerm = `%${search}%`;
      countParams.push(searchTerm, searchTerm, searchTerm);
      cpi += 3;
    }
    if (status) {
      countQuery += ` AND rh.redemption_status = $${cpi++}`;
      countParams.push(status);
    }
    if (reward_id) {
      countQuery += ` AND rh.reward_id = $${cpi++}`;
      countParams.push(reward_id);
    }
    if (date_from) {
      countQuery += ` AND CURRENT_DATE >= $${cpi++}`;
      countParams.push(date_from);
    }
    if (date_to) {
      countQuery += ` AND CURRENT_DATE <= $${cpi++}`;
      countParams.push(date_to);
    }

    const totalResult = await conn.query(countQuery, countParams);
    const totalCount = Number(totalResult.rows[0]?.total || 0);

    res.json({
      status: 'success',
      data: redemptions,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalCount,
        pages: Math.ceil(totalCount / parseInt(limit))
      }
    });
  } catch (err) {
    console.error('Error fetching redemptions:', err);
    res.status(500).json({ status: 'error', message: err.message });
  } finally {
    if (conn) conn.release();
  }
});

// Get single redemption details
router.get('/redemptions/:id', async (req, res) => {
  let conn;
  try {
    conn = await pool.connect();

    const redemption = await conn.query(`
      SELECT
        rh.*,
        u.full_name as user_name,
        u.phone_number as user_phone
      FROM reward_redemption_history rh
      LEFT JOIN users u ON rh.user_id = u.user_id
      WHERE rh.redemption_id = $1
    `, [req.params.id]);

    if (!redemption.rows.length) {
      return res.status(404).json({ status: 'error', message: 'Redemption not found' });
    }

    res.json({
      status: 'success',
      data: redemption.rows[0]
    });
  } catch (err) {
    console.error('Error fetching redemption:', err);
    res.status(500).json({ status: 'error', message: err.message });
  } finally {
    if (conn) conn.release();
  }
});

// Verify QR code
router.post('/qr/verify', async (req, res) => {
  let conn;
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ status: 'error', message: 'QR code is required' });
    }

    conn = await pool.connect();

    // Check redemption by qr_code field
    const redemption = await conn.query(`
      SELECT rh.*, u.full_name as user_name
      FROM reward_redemption_history rh
      LEFT JOIN users u ON rh.user_id = u.user_id
      WHERE rh.qr_code = $1
      LIMIT 1
    `, [code]);

    if (!redemption.rows.length) {
      return res.json({
        status: 'invalid',
        message: 'QR code not found',
        code
      });
    }

    const record = redemption.rows[0];
    const now = new Date();

    if (record.expires_at && new Date(record.expires_at) < now) {
      if (record.redemption_status === 'pending') {
        await conn.query(
          `UPDATE reward_redemption_history SET redemption_status = 'expired', updated_at = NOW() WHERE redemption_id = $1`,
          [record.redemption_id]
        );
      }
      return res.json({
        status: 'expired',
        message: 'QR code has expired',
        code,
        expires_at: record.expires_at
      });
    }

    if (record.redemption_status === 'used') {
      return res.json({
        status: 'already_used',
        message: 'QR code has already been used',
        code,
        used_at: record.used_at
      });
    }

    res.json({
      status: 'valid',
      message: 'QR code is valid and ready to use',
      code,
      reward_id: record.reward_id,
      reward_name: record.reward_name,
      points: record.points_redeemed,
      expires_at: record.expires_at,
      redemption: record
    });
  } catch (err) {
    console.error('Error verifying QR:', err);
    res.status(500).json({ status: 'error', message: err.message });
  } finally {
    if (conn) conn.release();
  }
});

// Mark redemption as used
router.post('/redemptions/:id/mark-used', async (req, res) => {
  let conn;
  try {
    conn = await pool.connect();

    const redemption = await conn.query(`
      SELECT * FROM reward_redemption_history WHERE redemption_id = $1
    `, [req.params.id]);

    if (!redemption.rows.length) {
      return res.status(404).json({ status: 'error', message: 'Redemption not found' });
    }

    await conn.query(`
      UPDATE reward_redemption_history
      SET redemption_status = 'used', used_at = NOW(), updated_at = NOW()
      WHERE redemption_id = $1
    `, [req.params.id]);

    res.json({
      status: 'success',
      message: 'Redemption marked as used',
      redemption_id: req.params.id
    });
  } catch (err) {
    console.error('Error marking redemption as used:', err);
    res.status(500).json({ status: 'error', message: err.message });
  } finally {
    if (conn) conn.release();
  }
});

// Cancel/Invalidate redemption
router.post('/redemptions/:id/cancel', async (req, res) => {
  let conn;
  try {
    const { reason } = req.body;
    conn = await pool.connect();

    const redemption = await conn.query(`
      SELECT * FROM reward_redemption_history WHERE redemption_id = $1
    `, [req.params.id]);

    if (!redemption.rows.length) {
      return res.status(404).json({ status: 'error', message: 'Redemption not found' });
    }

    await conn.query(`
      UPDATE reward_redemption_history
      SET redemption_status = 'cancelled', used_at = NOW(), updated_at = NOW()
      WHERE redemption_id = $1
    `, [req.params.id]);

    res.json({
      status: 'success',
      message: 'Redemption cancelled',
      redemption_id: req.params.id
    });
  } catch (err) {
    console.error('Error cancelling redemption:', err);
    res.status(500).json({ status: 'error', message: err.message });
  } finally {
    if (conn) conn.release();
  }
});

// Get QR usage statistics
router.get('/qr/stats', async (req, res) => {
  let conn;
  try {
    conn = await pool.connect();

    const statsResult = await conn.query(`
      SELECT
        COUNT(*) as total_redemptions,
        SUM(CASE WHEN redemption_status = 'used' THEN 1 ELSE 0 END) as used_redemptions,
        SUM(CASE WHEN redemption_status = 'pending' THEN 1 ELSE 0 END) as pending_redemptions,
        SUM(CASE WHEN redemption_status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_redemptions,
        SUM(CASE WHEN expires_at < NOW() AND redemption_status != 'used' THEN 1 ELSE 0 END) as expired_redemptions
      FROM reward_redemption_history
    `);
    const stats = statsResult.rows;

    res.json({
      status: 'success',
      data: {
        total_qr: Number(stats[0]?.total_redemptions || 0),
        used_qr: Number(stats[0]?.used_redemptions || 0),
        available_qr: Number(stats[0]?.pending_redemptions || 0),
        expired_qr: Number(stats[0]?.expired_redemptions || 0),
        pending_redemptions: Number(stats[0]?.pending_redemptions || 0),
        used_redemptions: Number(stats[0]?.used_redemptions || 0),
        cancelled_redemptions: Number(stats[0]?.cancelled_redemptions || 0),
        total_verifications: 0,
        unique_scanners: 0
      }
    });
  } catch (err) {
    console.error('Error fetching QR stats:', err);
    res.status(500).json({ status: 'error', message: err.message });
  } finally {
    if (conn) conn.release();
  }
});

// Get reward statistics with stock info
router.get('/rewards/stats/:id', async (req, res) => {
  let conn;
  try {
    conn = await pool.connect();

    const reward = await conn.query(`
      SELECT
        r.*,
        (SELECT COUNT(*) FROM reward_redemption_history WHERE reward_id = r.reward_id) as total_redeemed,
        (SELECT COUNT(*) FROM reward_redemption_history WHERE reward_id = r.reward_id AND redemption_status = 'used') as actually_used,
        (SELECT COUNT(*) FROM reward_redemption_history WHERE reward_id = r.reward_id AND redemption_status = 'pending') as pending_redemptions
      FROM rewards r
      WHERE r.reward_id = $1
    `, [req.params.id]);

    if (!reward.rows.length) {
      return res.status(404).json({ status: 'error', message: 'Reward not found' });
    }

    res.json({
      status: 'success',
      data: reward.rows[0]
    });
  } catch (err) {
    console.error('Error fetching reward stats:', err);
    res.status(500).json({ status: 'error', message: err.message });
  } finally {
    if (conn) conn.release();
  }
});

module.exports = router;
