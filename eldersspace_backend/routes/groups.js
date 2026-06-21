const express = require('express');
const router  = express.Router();
const pool    = require('../config/db');

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
    const conn   = await pool.getConnection();
    const [groups] = await conn.query('SELECT * FROM `groups` ORDER BY group_id');
    conn.release();
    res.json(groups);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/groups/:id/posts
router.get('/:id/posts', async (req, res) => {
  try {
    const groupId = Number(req.params.id);
    const phone   = req.query.phone;
    const conn    = await pool.getConnection();

    let viewerUserId = null;
    if (phone) {
      const [vr] = await conn.query('SELECT user_id FROM users WHERE phone_number=?', [phone]);
      if (vr.length) viewerUserId = Number(vr[0].user_id);
    }

    let extraSelect = '';
    if (viewerUserId) {
      extraSelect = `,
      (SELECT type FROM post_likes
       WHERE post_id=p.post_id AND user_id=${viewerUserId}) as user_like`;
    }

    const visCond = visibilityCondition(viewerUserId);

    const backendUrl = process.env.BACKEND_URL || 'http://10.0.2.2:3000';
    let [posts] = await conn.query(
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
       LEFT JOIN \`groups\` g ON p.group_id=g.group_id
       WHERE p.is_deleted=0 AND p.group_id=? AND ${visCond}
       ORDER BY p.created_at DESC`,
      [groupId]
    );

    for (let post of posts) {
      const [imgs] = await conn.query('SELECT image_url FROM post_images WHERE post_id=?', [post.post_id]);
      post.images = imgs.map(i => `${backendUrl}/uploads/` + i.image_url);
      post.profile_picture_url = post.profile_picture
        ? `${backendUrl}/uploads/` + post.profile_picture : null;
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
    const conn = await pool.getConnection();

    const [groupRows] = await conn.query('SELECT group_id, name FROM `groups` WHERE group_id=?', [groupId]);
    if (!groupRows.length) {
      conn.release();
      return res.status(404).json({ error: 'Group not found' });
    }

    if (!phone) {
      conn.release();
      return res.json({
        group_id: groupId,
        group_name: groupRows[0].name,
        is_member: false,
      });
    }

    const [userRows] = await conn.query('SELECT user_id FROM users WHERE phone_number=?', [phone]);
    if (!userRows.length) {
      conn.release();
      return res.status(404).json({ error: 'User not found' });
    }

    const userId = Number(userRows[0].user_id);
    const [memberRows] = await conn.query(
      'SELECT id FROM group_members WHERE group_id=? AND user_id=? LIMIT 1',
      [groupId, userId]
    );

    conn.release();
    res.json({
      group_id: groupId,
      group_name: groupRows[0].name,
      is_member: memberRows.length > 0,
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
    const conn  = await pool.getConnection();
    const [user]  = await conn.query('SELECT user_id FROM users WHERE phone_number=?', [phone]);
    if (!user.length) { conn.release(); return res.status(404).json({ error: 'User not found' }); }
    const userId = Number(user[0].user_id);
    await conn.query(
      'INSERT IGNORE INTO group_members(group_id, user_id) VALUES(?,?)',
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
    const conn    = await pool.getConnection();
    const [user]    = await conn.query('SELECT user_id FROM users WHERE phone_number=?', [phone]);
    if (!user.length) { conn.release(); return res.status(404).json({ error: 'User not found' }); }
    await conn.query(
      'DELETE FROM group_members WHERE group_id=? AND user_id=?',
      [groupId, Number(user[0].user_id)]
    );
    conn.release();
    res.json({ message: 'left' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
