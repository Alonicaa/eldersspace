// ========== New API Endpoints for Cloud SQL Data ==========
const pool = require('../config/db'); // ✅ เชื่อมกับ Cloud SQL pool

/**
 * GET /api/admin/users/blocked
 * ดึงรายชื่อผู้ใช้ที่ถูกแบนทั้งหมด
 */
async function getBlockedUsers(req, res) {
  let conn;
  try {
    conn = await pool.getConnection();

    const [blockedUsers] = await conn.query(
      `SELECT
        user_id,
        full_name,
        phone_number,
        role,
        profile_picture,
        is_blocked,
        blocked_reason,
        blocked_at,
        created_at
      FROM users
      WHERE is_blocked = 1
      ORDER BY blocked_at DESC
      LIMIT 1000`
    );

    return res.json({
      success: true,
      total: blockedUsers.length,
      users: blockedUsers
    });
  } catch (error) {
    console.error('Failed to get blocked users:', error);
    return res.status(500).json({ error: 'Failed to get blocked users' });
  } finally {
    if (conn) conn.release();
  }
}

/**
 * GET /api/admin/posts/reported
 * ดึงรายชื่อโพสต์ที่ถูกรายงานทั้งหมด
 */
async function getReportedPosts(req, res) {
  let conn;
  try {
    conn = await pool.getConnection();

    await conn.query(
      `CREATE TABLE IF NOT EXISTS post_reports (
        report_id INT AUTO_INCREMENT PRIMARY KEY,
        post_id INT NOT NULL,
        reporter_user_id INT NOT NULL,
        reason VARCHAR(100) NULL,
        detail TEXT NULL,
        status ENUM('pending','reviewed','dismissed') NOT NULL DEFAULT 'pending',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_post_reporter (post_id, reporter_user_id),
        INDEX idx_post_reports_post_id (post_id),
        INDEX idx_post_reports_status_created (status, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    );

    const [reportedPosts] = await conn.query(
      `SELECT
        p.post_id,
        p.content,
        p.created_at,
        u.full_name,
        u.phone_number,
        COUNT(pr.report_id) as report_count,
        SUM(CASE WHEN pr.status = 'pending' THEN 1 ELSE 0 END) as pending_count,
        (SELECT COUNT(*) FROM post_likes pl WHERE pl.post_id = p.post_id AND pl.type = 'like') as likes,
        (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.post_id) as comments
      FROM posts p
      JOIN users u ON u.user_id = p.user_id
      LEFT JOIN post_reports pr ON pr.post_id = p.post_id
      WHERE pr.report_id IS NOT NULL AND p.is_deleted = 0
      GROUP BY p.post_id
      ORDER BY pending_count DESC, p.created_at DESC
      LIMIT 100`
    );

    return res.json({
      success: true,
      total: reportedPosts.length,
      posts: reportedPosts.map(post => ({
        post_id: Number(post.post_id),
        content: post.content,
        author: post.full_name,
        author_phone: post.phone_number,
        report_count: Number(post.report_count),
        pending_count: Number(post.pending_count),
        likes: Number(post.likes),
        comments: Number(post.comments),
        created_at: post.created_at
      }))
    });
  } catch (error) {
    console.error('Failed to get reported posts:', error);
    return res.status(500).json({ error: 'Failed to get reported posts' });
  } finally {
    if (conn) conn.release();
  }
}

/**
 * GET /api/admin/campaigns?reward_id=X
 * ดึงแคมเปญพร้อม batches และ codes สำหรับ Promo Code Verifier
 */
async function getCampaigns(req, res) {
  let conn;
  try {
    conn = await pool.getConnection();
    const { reward_id } = req.query;

    // Check if promo_campaigns table exists
    const [tableCheck] = await conn.query(
      `SELECT COUNT(*) as total FROM information_schema.tables
       WHERE table_schema = DATABASE() AND table_name = 'promo_campaigns'`
    );

    if (Number(tableCheck[0]?.total || 0) === 0) {
      return res.json({ success: true, total: 0, data: [] });
    }

    // Build campaign query
    let query = `
      SELECT campaign_id, reward_id, campaign_name, campaign_start_date,
             campaign_end_date, description, is_active, created_at
      FROM promo_campaigns
      WHERE 1=1`;
    const params = [];

    if (reward_id) {
      query += ' AND reward_id = ?';
      params.push(reward_id);
    }

    query += ' ORDER BY created_at DESC LIMIT 1000';

    const [campaigns] = await conn.query(query, params);

    // For each campaign, fetch its codes and group into batches
    const campaignsWithBatches = await Promise.all(
      campaigns.map(async (campaign) => {
        const [codes] = await conn.query(
          `SELECT promo_code_id, code, description, expiry_date, is_used, used_at,
                  batch_upload_id, uploaded_at,
                  CASE
                    WHEN is_used = 1 THEN 'used'
                    WHEN expiry_date IS NOT NULL AND expiry_date < NOW() THEN 'expired'
                    ELSE 'available'
                  END AS status
           FROM promo_codes
           WHERE campaign_id = ?
           ORDER BY uploaded_at DESC, created_at ASC`,
          [campaign.campaign_id]
        );

        const batchMap = {};
        codes.forEach(code => {
          const batchKey = code.batch_upload_id ||
            (code.uploaded_at ? new Date(code.uploaded_at).toISOString().split('T')[0] : 'default');
          if (!batchMap[batchKey]) {
            batchMap[batchKey] = { batch_id: batchKey, uploaded_at: code.uploaded_at, codes: [] };
          }
          batchMap[batchKey].codes.push(code);
        });

        return {
          campaign_id: Number(campaign.campaign_id),
          reward_id: Number(campaign.reward_id),
          campaign_name: campaign.campaign_name,
          campaign_start_date: campaign.campaign_start_date,
          campaign_end_date: campaign.campaign_end_date,
          description: campaign.description,
          is_active: campaign.is_active,
          created_at: campaign.created_at,
          batches: Object.values(batchMap)
        };
      })
    );

    return res.json({
      success: true,
      total: campaignsWithBatches.length,
      data: campaignsWithBatches
    });
  } catch (error) {
    console.error('Failed to get campaigns:', error);
    return res.status(500).json({ error: 'Failed to get campaigns' });
  } finally {
    if (conn) conn.release();
  }
}

module.exports = {
  getBlockedUsers,
  getReportedPosts,
  getCampaigns
};
