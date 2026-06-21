const pool   = require('../config/db');
const multer = require('multer');
const path   = require('path');
const fs     = require('fs');
const { assertUserCanInteract } = require('../services/moderationService');

// ─── Multer temp storage ───
const tmpStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = 'uploads/tmp/';
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
exports.upload = multer({ storage: tmpStorage }).any();

function sanitizeName(name) {
  return (name || 'unknown')
    .replace(/[^a-zA-Z0-9ก-๙\-_]/g, '_')
    .replace(/_+/g, '_').replace(/^_|_$/, '')
    .substring(0, 50);
}
function moveToPostFolder(tmpPath, userName, postId, filename) {
  const safeUser = sanitizeName(userName);
  const dir = `uploads/posts/${safeUser}/${postId}/`;
  fs.mkdirSync(dir, { recursive: true });
  fs.renameSync(tmpPath, dir + filename);
  return `posts/${safeUser}/${postId}/${filename}`;
}
function deletePostFolder(userName, postId) {
  const dir = `uploads/posts/${sanitizeName(userName)}/${postId}/`;
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

async function ensureHiddenPostsTable(conn) {
  await conn.query(
    `CREATE TABLE IF NOT EXISTS hidden_posts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      post_id INT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_user_post (user_id, post_id),
      INDEX idx_hidden_posts_user (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  );
  // เพิ่ม linked_article_id ถ้ายังไม่มี (idempotent)
  try {
    await conn.query(
      'ALTER TABLE posts ADD COLUMN linked_article_id INT NULL DEFAULT NULL'
    );
  } catch (e) { /* already exists */ }
}

async function ensurePostReportTable(conn) {
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
      INDEX idx_post_reports_status_created (status, created_at),
      CONSTRAINT fk_post_reports_post FOREIGN KEY (post_id) REFERENCES posts(post_id) ON DELETE CASCADE,
      CONSTRAINT fk_post_reports_reporter FOREIGN KEY (reporter_user_id) REFERENCES users(user_id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  );
}

// ─── Visibility filter ───
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

const BACKEND_URL = process.env.BACKEND_URL || 'http://10.0.2.2:3000';

// ─── helper: ดึงโพสต์ต้นฉบับจริงๆ (chase chain จนถึง root) ───
async function getOriginalPost(conn, sharedPostId) {
  if (!sharedPostId) return null;

  // วนหาจนกว่าจะเจอโพสต์ที่ไม่ได้แชร์ต่อ (shared_post_id = null)
  let currentId = sharedPostId;
  let visited   = new Set();

  while (currentId) {
    if (visited.has(currentId)) break; // กันวนลูป
    visited.add(currentId);

    const [rows] = await conn.query(
      `SELECT p.post_id, p.content, p.created_at, p.shared_post_id,
              u.full_name, u.phone_number, u.profile_picture
       FROM posts p
       JOIN users u ON p.user_id=u.user_id
       WHERE p.post_id=?`,
      [currentId]
    );
    if (!rows.length) return null;

    const row = rows[0];

    // ถ้าโพสต์นี้ยังแชร์ต่ออีก ให้ไปดึงโพสต้นฉบับของมันแทน
    if (row.shared_post_id) {
      currentId = Number(row.shared_post_id);
      continue;
    }

    // เจอต้นฉบับแล้ว
    const [imgs] = await conn.query(
      'SELECT image_url FROM post_images WHERE post_id=?', [row.post_id]
    );
    row.images = imgs.map(i => `${BACKEND_URL}/uploads/` + i.image_url);
    row.profile_picture_url = row.profile_picture
      ? `${BACKEND_URL}/uploads/` + row.profile_picture : null;
    delete row.shared_post_id; // ไม่ต้องส่งกลับ
    return row;
  }

  return null;
}

// ─── CREATE POST ───
exports.createPost = async (req, res) => {
  try {
    const { phone, content, visibility = 'public', shared_post_id, group_id, linked_article_id } = req.body;
    const conn = await pool.getConnection();
    if (shared_post_id) {
      const guard = await assertUserCanInteract(conn, phone);
      if (!guard.allowed) {
        conn.release();
        return res.status(guard.statusCode).json(guard.payload);
      }
    }

    const [user] = await conn.query('SELECT user_id, full_name FROM users WHERE phone_number=?', [phone]);
    if (!user.length) { conn.release(); return res.status(404).json({ error: 'User not found' }); }

    const userId   = Number(user[0].user_id);
    const userName = user[0].full_name || phone;
    const valid    = ['public', 'friends', 'followers', 'only_me'];
    const safeVis  = valid.includes(visibility) ? visibility : 'public';
    const sharedId     = shared_post_id     ? Number(shared_post_id)     : null;
    const safeGroup    = group_id           ? Number(group_id)           : null;
    const safeArticleId = linked_article_id ? Number(linked_article_id) : null;

    // ตรวจสอบว่า group_id นี้มีอยู่จริง (ถ้าระบุมา)
    // Verify group exists and user is a member before posting into that group.
    if (safeGroup) {
      const [grp] = await conn.query('SELECT group_id FROM `groups` WHERE group_id=?', [safeGroup]);
      if (!grp.length) { conn.release(); return res.status(404).json({ error: 'Group not found' }); }

      const [member] = await conn.query(
        'SELECT id FROM group_members WHERE group_id=? AND user_id=? LIMIT 1',
        [safeGroup, userId]
      );
      if (!member.length) {
        conn.release();
        return res.status(403).json({ error: 'Join the group before posting' });
      }
    }

    const [result] = await conn.query(
      'INSERT INTO posts(user_id, content, visibility, group_id, shared_post_id, linked_article_id) VALUES(?,?,?,?,?,?)',
      [userId, content, safeVis, safeGroup, sharedId, safeArticleId]
    );
    const postId = Number(result.insertId);

    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const relPath = moveToPostFolder(file.path, userName, postId, file.filename);
        await conn.query('INSERT INTO post_images(post_id,image_url) VALUES(?,?)', [postId, relPath]);
      }
    }

    conn.release();
    res.json({ message: 'post created', post_id: postId });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: err.message });
  }
};

// ─── GET POSTS ───
exports.getPosts = async (req, res) => {
  try {
    const conn  = await pool.getConnection();
    await ensureHiddenPostsTable(conn);
    const phone = req.query.phone;

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

    let [posts] = await conn.query(
      `SELECT
        p.*,
        u.full_name, u.phone_number, u.profile_picture${extraSelect},
        g.name as group_name, g.color_hex as group_color, g.icon as group_icon,
        (SELECT COUNT(*) FROM post_likes WHERE post_id=p.post_id AND type='like')    as likes,
        (SELECT COUNT(*) FROM post_likes WHERE post_id=p.post_id AND type='dislike') as dislikes,
          (SELECT COUNT(*) FROM comments    WHERE post_id=p.post_id AND is_deleted=0) as comments,
        (SELECT COUNT(*) FROM posts sp WHERE sp.shared_post_id=p.post_id AND sp.is_deleted=0) as shares
       FROM posts p
       JOIN users u ON p.user_id=u.user_id
       LEFT JOIN \`groups\` g ON p.group_id=g.group_id
       WHERE p.is_deleted=0 AND ${visCond}${viewerUserId ? `
         AND NOT EXISTS (SELECT 1 FROM hidden_posts WHERE user_id=${viewerUserId} AND post_id=p.post_id)` : ''}
       ORDER BY p.created_at DESC`
    );

    for (let post of posts) {
      // normalize created_at เป็น UTC ISO string เสมอ
      if (post.created_at) {
        post.created_at = new Date(post.created_at).toISOString();
      }

      // รูปของโพสต์นี้
      const [imgs] = await conn.query('SELECT image_url FROM post_images WHERE post_id=?', [post.post_id]);
      post.images = imgs.map(i => `${BACKEND_URL}/uploads/` + i.image_url);
      post.profile_picture_url = post.profile_picture
        ? `${BACKEND_URL}/uploads/` + post.profile_picture : null;

      // ดึงโพสต์ต้นฉบับถ้าเป็นการแชร์
      post.shared_post = await getOriginalPost(conn, post.shared_post_id);

      // ดึงข้อมูลบทความที่แนบมา
      if (post.linked_article_id) {
        const [artRows] = await conn.query(
          `SELECT article_id, title, author_name, cover_image, summary, category
           FROM articles
           WHERE article_id = ? AND is_deleted = 0 AND status = 'approved'`,
          [post.linked_article_id]
        );
        if (artRows.length) {
          const art = artRows[0];
          art.cover_image_url = art.cover_image
            ? `${BACKEND_URL}/uploads/${art.cover_image}`
            : null;
          post.linked_article = art;
        }
      }
    }

    conn.release();

    const mappedPosts = posts.map(p => ({
      ...p,
      likes: Number(p.likes),
      dislikes: Number(p.dislikes),
      comments: Number(p.comments),
      shares: Number(p.shares),
    }));

    res.json(mappedPosts);
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: err.message });
  }
};

// ─── LIKE POST ───
exports.likePost = async (req, res) => {
  try {
    const postId = req.params.id;
    const { phone, type } = req.body;
    const conn = await pool.getConnection();

    const guard = await assertUserCanInteract(conn, phone);
    if (!guard.allowed) {
      conn.release();
      return res.status(guard.statusCode).json(guard.payload);
    }

    const [user] = await conn.query('SELECT user_id FROM users WHERE phone_number=?', [phone]);
    if (!user.length) { conn.release(); return res.status(404).json({ error: 'User not found' }); }
    const userId = user[0].user_id;
    if (type === 'remove' || type === 'unlike') {
      await conn.query('DELETE FROM post_likes WHERE post_id=? AND user_id=?', [postId, userId]);
    } else {
      await conn.query(
        'INSERT INTO post_likes(post_id,user_id,type) VALUES(?,?,?) ON DUPLICATE KEY UPDATE type=?',
        [postId, userId, type, type]
      );
    }
    const [post] = await conn.query('SELECT user_id FROM posts WHERE post_id=?', [postId]);
    if (post.length) {
      await conn.query("INSERT INTO notifications(user_id,actor_id,post_id,type) VALUES(?,?,?,'like')",
        [post[0].user_id, userId, postId]);
    }
    conn.release();
    res.json({ message: 'liked' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ─── HIDE POST (เฉพาะ user ที่กดซ่อน ไม่กระทบคนอื่น) ───
exports.hidePost = async (req, res) => {
  try {
    const postId = Number(req.params.id);
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'phone required' });

    const conn = await pool.getConnection();
    const [user] = await conn.query('SELECT user_id FROM users WHERE phone_number=?', [phone]);
    if (!user.length) { conn.release(); return res.status(404).json({ error: 'User not found' }); }
    const userId = user[0].user_id;

    await ensureHiddenPostsTable(conn);

    await conn.query(
      'INSERT IGNORE INTO hidden_posts (user_id, post_id) VALUES (?, ?)',
      [userId, postId]
    );
    conn.release();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ─── REPORT POST ───
exports.reportPost = async (req, res) => {
  let conn;

  try {
    const postId = Number(req.params.id);
    const { phone, reason = null, detail = null } = req.body;

    if (!Number.isFinite(postId) || postId <= 0) {
      return res.status(400).json({ error: 'Invalid post id' });
    }
    if (!phone) {
      return res.status(400).json({ error: 'Phone required' });
    }

    conn = await pool.getConnection();
    await ensurePostReportTable(conn);

    const [userRows] = await conn.query(
      'SELECT user_id FROM users WHERE phone_number=? LIMIT 1',
      [phone]
    );
    if (!userRows.length) {
      return res.status(404).json({ error: 'User not found' });
    }
    const reporterUserId = Number(userRows[0].user_id);

    const [postRows] = await conn.query(
      'SELECT user_id, is_deleted FROM posts WHERE post_id=? LIMIT 1',
      [postId]
    );
    if (!postRows.length || Number(postRows[0].is_deleted || 0) === 1) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const ownerUserId = Number(postRows[0].user_id);
    if (ownerUserId === reporterUserId) {
      return res.status(400).json({ error: 'Cannot report your own post' });
    }

    const cleanReason = reason == null ? null : String(reason).trim().slice(0, 100);
    const cleanDetail = detail == null ? null : String(detail).trim().slice(0, 2000);

    await conn.query(
      `INSERT INTO post_reports(post_id, reporter_user_id, reason, detail)
       VALUES(?,?,?,?)
       ON DUPLICATE KEY UPDATE
         reason=VALUES(reason),
         detail=VALUES(detail),
         status='pending',
         updated_at=CURRENT_TIMESTAMP`,
      [postId, reporterUserId, cleanReason, cleanDetail]
    );

    return res.json({ message: 'reported' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  } finally {
    if (conn) conn.release();
  }
};

// ─── UPDATE POST ───
exports.updatePost = async (req, res) => {
  try {
    const postId = req.params.id;
    const { phone, content, visibility } = req.body;
    const conn = await pool.getConnection();
    const [user] = await conn.query('SELECT user_id, full_name FROM users WHERE phone_number=?', [phone]);
    if (!user.length) { conn.release(); return res.status(404).json({ error: 'User not found' }); }
    const userId   = Number(user[0].user_id);
    const userName = user[0].full_name || phone;
    const [post] = await conn.query('SELECT user_id FROM posts WHERE post_id=?', [postId]);
    if (!post.length) { conn.release(); return res.status(404).json({ error: 'Post not found' }); }
    if (Number(post[0].user_id) !== userId) { conn.release(); return res.status(403).json({ error: 'Forbidden' }); }
    const valid   = ['public', 'friends', 'followers', 'only_me'];
    const safeVis = valid.includes(visibility) ? visibility : 'public';
    await conn.query('UPDATE posts SET content=?, visibility=? WHERE post_id=?', [content, safeVis, postId]);
    if (req.files && req.files.length > 0) {
      await conn.query('DELETE FROM post_images WHERE post_id=?', [postId]);
      deletePostFolder(userName, postId);
      for (const file of req.files) {
        const relPath = moveToPostFolder(file.path, userName, postId, file.filename);
        await conn.query('INSERT INTO post_images(post_id,image_url) VALUES(?,?)', [postId, relPath]);
      }
    }
    conn.release();
    res.json({ message: 'post updated' });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: err.message });
  }
};

// ─── DELETE POST (Soft Delete) ───
// อัปเดต is_deleted=1 และ deleted_at เท่านั้น
// ข้อมูลยังอยู่ใน DB ให้ admin ดูได้ในหลังบ้าน
exports.deletePost = async (req, res) => {
  try {
    const postId = req.params.id;
    const phone  = req.query.phone;
    if (!phone) return res.status(400).json({ error: 'Phone required' });

    const conn = await pool.getConnection();

    const [user] = await conn.query(
      'SELECT user_id FROM users WHERE phone_number=?', [phone]
    );
    if (!user.length) { conn.release(); return res.status(404).json({ error: 'User not found' }); }
    const userId = Number(user[0].user_id);

    const [post] = await conn.query(
      'SELECT user_id, is_deleted FROM posts WHERE post_id=?', [postId]
    );
    if (!post.length) { conn.release(); return res.status(404).json({ error: 'Post not found' }); }
    if (Number(post[0].user_id) !== userId) { conn.release(); return res.status(403).json({ error: 'Forbidden' }); }
    if (post[0].is_deleted) { conn.release(); return res.status(400).json({ error: 'Post already deleted' }); }

    // Soft delete: แค่ mark ว่าลบ ไม่ได้ลบข้อมูลจริง
    await conn.query(
      'UPDATE posts SET is_deleted=1, deleted_at=NOW() WHERE post_id=?',
      [postId]
    );

    conn.release();
    res.json({ message: 'Post deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

// ─── ADMIN: GET ALL DELETED POSTS ───
// สำหรับ admin หลังบ้านดูโพสต์ที่ถูกลบทั้งหมด
exports.getDeletedPosts = async (req, res) => {
  try {
    const conn = await pool.getConnection();

    let [posts] = await conn.query(
      `SELECT
        p.*,
        u.full_name, u.phone_number, u.profile_picture,
        (SELECT COUNT(*) FROM post_likes WHERE post_id=p.post_id AND type='like')    as likes,
        (SELECT COUNT(*) FROM post_likes WHERE post_id=p.post_id AND type='dislike') as dislikes,
         (SELECT COUNT(*) FROM comments    WHERE post_id=p.post_id AND is_deleted=0)   as comments,
        (SELECT COUNT(*) FROM posts sp WHERE sp.shared_post_id=p.post_id AND sp.is_deleted=0) as shares
       FROM posts p
       JOIN users u ON p.user_id=u.user_id
       WHERE p.is_deleted=1
       ORDER BY p.deleted_at DESC`
    );

    for (let post of posts) {
      const [imgs] = await conn.query('SELECT image_url FROM post_images WHERE post_id=?', [post.post_id]);
      post.images = imgs.map(i => `${BACKEND_URL}/uploads/` + i.image_url);
      post.profile_picture_url = post.profile_picture
        ? `${BACKEND_URL}/uploads/` + post.profile_picture : null;
    }

    conn.release();

    posts = posts.map(p => ({
      ...p,
      likes:    Number(p.likes),
      dislikes: Number(p.dislikes),
      comments: Number(p.comments),
      shares:   Number(p.shares),
    }));

    res.json(posts);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

// ─── ADMIN: RESTORE DELETED POST ───
// admin กู้คืนโพสต์ที่ถูกลบกลับมา
exports.restorePost = async (req, res) => {
  try {
    const postId = req.params.id;
    const conn   = await pool.getConnection();

    const [post] = await conn.query(
      'SELECT post_id, is_deleted FROM posts WHERE post_id=?', [postId]
    );
    if (!post.length) { conn.release(); return res.status(404).json({ error: 'Post not found' }); }
    if (!post[0].is_deleted) { conn.release(); return res.status(400).json({ error: 'Post is not deleted' }); }

    await conn.query(
      'UPDATE posts SET is_deleted=0, deleted_at=NULL WHERE post_id=?', [postId]
    );

    conn.release();
    res.json({ message: 'Post restored successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};