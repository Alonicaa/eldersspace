const express = require('express');
const router  = express.Router();
const pool    = require('../config/db');
const { verifyAdminToken } = require('../controllers/authController');

const adminTokenAuth = (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const payload = verifyAdminToken(token);
  if (!payload) {
    return res.status(401).json({ error: 'Unauthorized: invalid admin token' });
  }
  req.admin = payload;
  next();
};

async function ensureGroupColumns(conn) {
  try {
    await conn.query('ALTER TABLE groups ADD COLUMN IF NOT EXISTS is_deleted SMALLINT NOT NULL DEFAULT 0');
  } catch (e) { /* already exists */ }
}

function visibilityCondition(viewerUserId) {
  if (!viewerUserId) return `p.visibility = 'public'`;
  return `(
    p.visibility = 'public'
    OR p.user_id = ${viewerUserId}
    OR (p.visibility = 'only_me' AND p.user_id = ${viewerUserId})
    OR (
      p.visibility = 'followers'
      AND EXISTS (SELECT 1 FROM followers WHERE follower_id=${viewerUserId} AND following_id=p.user_id)
    )
    OR (
      p.visibility = 'friends'
      AND EXISTS (
        SELECT 1 FROM followers f1
        JOIN followers f2
          ON f1.follower_id=${viewerUserId} AND f1.following_id=p.user_id
         AND f2.follower_id=p.user_id       AND f2.following_id=${viewerUserId}
      )
    )
  )`;
}

// GET /api/groups
router.get('/', async (req, res) => {
  try {
    const conn = await pool.connect();
    await ensureGroupColumns(conn);
    const { rows: groups } = await conn.query('SELECT * FROM groups WHERE is_deleted = 0 ORDER BY group_id');
    conn.release();
    res.json(groups);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/groups — admin only
router.post('/', adminTokenAuth, async (req, res) => {
  const { name, description, icon, color_hex } = req.body || {};
  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: 'name is required' });
  }
  try {
    const conn = await pool.connect();
    await ensureGroupColumns(conn);
    const { rows } = await conn.query(
      `INSERT INTO groups (name, description, icon, color_hex)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [String(name).trim(), description || null, icon || null, color_hex || null]
    );
    conn.release();
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/groups/:id — admin only
router.put('/:id', adminTokenAuth, async (req, res) => {
  const groupId = Number(req.params.id);
  const { name, description, icon, color_hex } = req.body || {};
  if (!Number.isFinite(groupId) || groupId <= 0) {
    return res.status(400).json({ error: 'Invalid group id' });
  }
  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: 'name is required' });
  }
  try {
    const conn = await pool.connect();
    await ensureGroupColumns(conn);
    const { rows } = await conn.query(
      `UPDATE groups SET name=$1, description=$2, icon=$3, color_hex=$4
       WHERE group_id=$5 AND is_deleted=0 RETURNING *`,
      [String(name).trim(), description || null, icon || null, color_hex || null, groupId]
    );
    conn.release();
    if (!rows.length) return res.status(404).json({ error: 'Group not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/groups/:id — admin only, soft delete
router.delete('/:id', adminTokenAuth, async (req, res) => {
  const groupId = Number(req.params.id);
  if (!Number.isFinite(groupId) || groupId <= 0) {
    return res.status(400).json({ error: 'Invalid group id' });
  }
  try {
    const conn = await pool.connect();
    await ensureGroupColumns(conn);
    const { rows } = await conn.query(
      'UPDATE groups SET is_deleted=1 WHERE group_id=$1 AND is_deleted=0 RETURNING group_id',
      [groupId]
    );
    conn.release();
    if (!rows.length) return res.status(404).json({ error: 'Group not found' });
    res.json({ message: 'Group deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/groups/:id/posts
router.get('/:id/posts', async (req, res) => {
  try {
    const groupId = Number(req.params.id);
    const phone   = req.query.phone;
    const conn    = await pool.connect();

    let viewerUserId = null;
    if (phone) {
      const vr = await conn.query('SELECT user_id FROM users WHERE phone_number=$1', [phone]);
      if (vr.rows.length) viewerUserId = Number(vr.rows[0].user_id);
    }

    let extraSelect = '';
    if (viewerUserId) {
      extraSelect = `,
      (SELECT type FROM post_likes
       WHERE post_id=p.post_id AND user_id=${viewerUserId}) as user_like`;
    }

    const visCond = visibilityCondition(viewerUserId);

    const _supabaseBase = process.env.SUPABASE_URL
      ? `${process.env.SUPABASE_URL}/storage/v1/object/public/uploads`
      : null;
    const _backendUrl = process.env.BACKEND_URL || 'https://eldersspace-backend.onrender.com';
    const postsResult = await conn.query(
      `SELECT
        p.*,
        u.full_name, u.phone_number, u.profile_picture${extraSelect},
        g.name as group_name, g.color_hex as group_color, g.icon as group_icon,
        (SELECT COUNT(*) FROM post_likes WHERE post_id=p.post_id AND type='like')    as likes,
        (SELECT COUNT(*) FROM post_likes WHERE post_id=p.post_id AND type='dislike') as dislikes,
        (SELECT COUNT(*) FROM comments    WHERE post_id=p.post_id) as comments,
        (SELECT COUNT(*) FROM posts sp WHERE sp.shared_post_id=p.post_id AND sp.is_deleted=0) as shares
       FROM posts p
       JOIN users u ON p.user_id=u.user_id
       LEFT JOIN groups g ON p.group_id=g.group_id
       WHERE p.is_deleted=0 AND p.group_id=$1 AND ${visCond}
       ORDER BY p.created_at DESC`,
      [groupId]
    );
    let posts = postsResult.rows;

    for (let post of posts) {
      const imgs = await conn.query('SELECT image_url FROM post_images WHERE post_id=$1', [post.post_id]);
      const resolveUrl = (v) => {
        if (!v) return null;
        if (/^https?:\/\//i.test(v)) return v;
        const clean = v.replace(/^\/?(uploads\/)?/, '');
        if (_supabaseBase) return `${_supabaseBase}/${clean}`;
        return `${_backendUrl}/uploads/${clean}`;
      };
      post.images = imgs.rows.map(i => resolveUrl(i.image_url));
      post.profile_picture_url = resolveUrl(post.profile_picture);
    }

    conn.release();
    res.json(posts.map(p => ({
      ...p,
      likes: Number(p.likes),
      dislikes: Number(p.dislikes),
      comments: Number(p.comments),
      shares: Number(p.shares),
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/groups/:id/status?phone=...
router.get('/:id/status', async (req, res) => {
  try {
    const groupId = Number(req.params.id);
    const phone = req.query.phone;
    const conn = await pool.connect();

    const groupRows = await conn.query('SELECT group_id, name FROM groups WHERE group_id=$1', [groupId]);
    if (!groupRows.rows.length) {
      conn.release();
      return res.status(404).json({ error: 'Group not found' });
    }

    if (!phone) {
      conn.release();
      return res.json({
        group_id: groupId,
        group_name: groupRows.rows[0].name,
        is_member: false,
      });
    }

    const userRows = await conn.query('SELECT user_id FROM users WHERE phone_number=$1', [phone]);
    if (!userRows.rows.length) {
      conn.release();
      return res.status(404).json({ error: 'User not found' });
    }

    const userId = Number(userRows.rows[0].user_id);
    const memberRows = await conn.query(
      'SELECT id FROM group_members WHERE group_id=$1 AND user_id=$2 LIMIT 1',
      [groupId, userId]
    );

    conn.release();
    res.json({
      group_id: groupId,
      group_name: groupRows.rows[0].name,
      is_member: memberRows.rows.length > 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/groups/:id/join
router.post('/:id/join', async (req, res) => {
  try {
    const groupId = Number(req.params.id);
    const { phone } = req.body;
    const conn  = await pool.connect();
    const user  = await conn.query('SELECT user_id FROM users WHERE phone_number=$1', [phone]);
    if (!user.rows.length) { conn.release(); return res.status(404).json({ error: 'User not found' }); }
    const userId = Number(user.rows[0].user_id);
    await conn.query(
      'INSERT INTO group_members(group_id, user_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
      [groupId, userId]
    );
    conn.release();
    res.json({ message: 'joined' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/groups/:id/leave
router.delete('/:id/leave', async (req, res) => {
  try {
    const groupId = Number(req.params.id);
    const phone   = req.query.phone;
    const conn    = await pool.connect();
    const user    = await conn.query('SELECT user_id FROM users WHERE phone_number=$1', [phone]);
    if (!user.rows.length) { conn.release(); return res.status(404).json({ error: 'User not found' }); }
    await conn.query(
      'DELETE FROM group_members WHERE group_id=$1 AND user_id=$2',
      [groupId, Number(user.rows[0].user_id)]
    );
    conn.release();
    res.json({ message: 'left' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
