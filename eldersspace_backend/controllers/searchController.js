const pool = require('../config/db');
const { ensureModerationColumns } = require('../services/moderationService');
const { visibilityCondition, resolveUrl } = require('./postController');

// GET /api/search?q=&phone=
exports.search = async (req, res) => {
  const q = (req.query.q || '').trim();
  const phone = req.query.phone;

  if (!q) {
    return res.json({ users: [], posts: [] });
  }
  if (q.length > 100) {
    return res.status(400).json({ error: 'Search query too long' });
  }

  let conn;
  try {
    conn = await pool.connect();
    await ensureModerationColumns(conn);

    let viewerUserId = null;
    if (phone) {
      const { rows: vr } = await conn.query('SELECT user_id FROM users WHERE phone_number=$1', [phone]);
      if (vr.length) viewerUserId = Number(vr[0].user_id);
    }

    const like = `%${q}%`;

    const { rows: users } = await conn.query(
      `SELECT user_id, full_name, phone_number, profile_picture
       FROM users
       WHERE is_blocked = 0 AND full_name ILIKE $1
       ORDER BY full_name ASC
       LIMIT 20`,
      [like]
    );

    const visCond = visibilityCondition(viewerUserId);
    const { rows: posts } = await conn.query(
      `SELECT
        p.post_id, p.content, p.created_at, p.user_id,
        u.full_name, u.phone_number, u.profile_picture
       FROM posts p
       JOIN users u ON p.user_id = u.user_id
       WHERE p.is_deleted = 0 AND ${visCond} AND p.content ILIKE $1
       ORDER BY p.created_at DESC
       LIMIT 20`,
      [like]
    );

    res.json({
      users: users.map(u => ({ ...u, profile_picture_url: resolveUrl(u.profile_picture) })),
      posts: posts.map(p => ({ ...p, profile_picture_url: resolveUrl(p.profile_picture) })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    if (conn) conn.release();
  }
};
