const pool   = require('../config/db');
const multer = require('multer');
const { uploadToStorage } = require('../config/supabaseStorage');
const { assertUserCanInteract } = require('../services/moderationService');

// ─── Multer memory storage (files are uploaded to Supabase Storage) ───
exports.upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }).any();

async function ensureHiddenPostsTable(conn) {
  await conn.query(
    `CREATE TABLE IF NOT EXISTS hidden_posts (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL,
      post_id INT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (user_id, post_id)
    )`
  );
  // เพิ่ม linked_article_id ถ้ายังไม่มี (idempotent)
  try {
    await conn.query(
      'ALTER TABLE posts ADD COLUMN linked_article_id INT NULL DEFAULT NULL'
    );
  } catch (e) { /* already exists */ }
  // ensure is_deleted on comments (MySQL migration used AFTER clause which fails on PostgreSQL)
  try {
    await conn.query(
      'ALTER TABLE comments ADD COLUMN IF NOT EXISTS is_deleted SMALLINT NOT NULL DEFAULT 0'
    );
  } catch (e) { /* already exists */ }
}

async function ensurePostReportTable(conn) {
  await conn.query(
    `CREATE TABLE IF NOT EXISTS post_reports (
      report_id SERIAL PRIMARY KEY,
      post_id INT NOT NULL,
      reporter_user_id INT NOT NULL,
      reason VARCHAR(100) NULL,
      detail TEXT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (post_id, reporter_user_id)
    )`
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

const SUPABASE_STORAGE_BASE = process.env.SUPABASE_URL
  ? `${process.env.SUPABASE_URL}/storage/v1/object/public/uploads`
  : null;
const BACKEND_URL = process.env.BACKEND_URL || 'http://10.0.2.2:3000';

// Resolve a stored image_url/profile_picture value to a full URL.
// New uploads store the full Supabase public URL; legacy rows store relative paths.
function resolveUrl(stored) {
  if (!stored) return null;
  if (/^https?:\/\//i.test(stored)) return stored;
  const clean = stored.replace(/^\/?(uploads\/)?/, '');
  if (SUPABASE_STORAGE_BASE) return `${SUPABASE_STORAGE_BASE}/${clean}`;
  return `${BACKEND_URL}/uploads/${clean}`;
}

// ─── helper: ดึงโพสต์ต้นฉบับจริงๆ (chase chain จนถึง root) ───
async function getOriginalPost(conn, sharedPostId) {
  if (!sharedPostId) return null;

  let currentId = sharedPostId;
  let visited   = new Set();

  while (currentId) {
    if (visited.has(currentId)) break;
    visited.add(currentId);

    const { rows } = await conn.query(
      `SELECT p.post_id, p.content, p.created_at, p.shared_post_id,
              u.full_name, u.phone_number, u.profile_picture
       FROM posts p
       JOIN users u ON p.user_id=u.user_id
       WHERE p.post_id=$1`,
      [currentId]
    );
    if (!rows.length) return null;

    const row = rows[0];

    if (row.shared_post_id) {
      currentId = Number(row.shared_post_id);
      continue;
    }

    const { rows: imgs } = await conn.query(
      'SELECT image_url FROM post_images WHERE post_id=$1', [row.post_id]
    );
    row.images = imgs.map(i => resolveUrl(i.image_url));
    row.profile_picture_url = resolveUrl(row.profile_picture);
    delete row.shared_post_id;
    return row;
  }

  return null;
}

// ─── CREATE POST ───
exports.createPost = async (req, res) => {
  try {
    const { phone, content, visibility = 'public', shared_post_id, group_id, linked_article_id } = req.body;
    const conn = await pool.connect();
    if (shared_post_id) {
      const guard = await assertUserCanInteract(conn, phone);
      if (!guard.allowed) {
        conn.release();
        return res.status(guard.statusCode).json(guard.payload);
      }
    }

    const { rows: user } = await conn.query('SELECT user_id, full_name FROM users WHERE phone_number=$1', [phone]);
    if (!user.length) { conn.release(); return res.status(404).json({ error: 'User not found' }); }

    const userId   = Number(user[0].user_id);
    const userName = user[0].full_name || phone;
    const valid    = ['public', 'friends', 'followers', 'only_me'];
    const safeVis  = valid.includes(visibility) ? visibility : 'public';
    const sharedId     = shared_post_id     ? Number(shared_post_id)     : null;
    const safeGroup    = group_id           ? Number(group_id)           : null;
    const safeArticleId = linked_article_id ? Number(linked_article_id) : null;

    if (safeGroup) {
      const { rows: grp } = await conn.query('SELECT group_id FROM groups WHERE group_id=$1', [safeGroup]);
      if (!grp.length) { conn.release(); return res.status(404).json({ error: 'Group not found' }); }

      const { rows: member } = await conn.query(
        'SELECT id FROM group_members WHERE group_id=$1 AND user_id=$2 LIMIT 1',
        [safeGroup, userId]
      );
      if (!member.length) {
        conn.release();
        return res.status(403).json({ error: 'Join the group before posting' });
      }
    }

    const { rows: result } = await conn.query(
      'INSERT INTO posts(user_id, content, visibility, group_id, shared_post_id, linked_article_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING post_id',
      [userId, content, safeVis, safeGroup, sharedId, safeArticleId]
    );
    const postId = Number(result[0].post_id);

    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const publicUrl = await uploadToStorage(file.buffer, file.originalname, file.mimetype, 'posts');
        await conn.query('INSERT INTO post_images(post_id,image_url) VALUES($1,$2)', [postId, publicUrl]);
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
    const conn  = await pool.connect();
    await ensureHiddenPostsTable(conn);
    const phone = req.query.phone;

    let viewerUserId = null;
    if (phone) {
      const { rows: vr } = await conn.query('SELECT user_id FROM users WHERE phone_number=$1', [phone]);
      if (vr.length) viewerUserId = Number(vr[0].user_id);
    }

    let extraSelect = '';
    if (viewerUserId) {
      extraSelect = `,
      (SELECT type FROM post_likes
       WHERE post_id=p.post_id AND user_id=${viewerUserId}) as user_like`;
    }

    const visCond = visibilityCondition(viewerUserId);

    const { rows: posts } = await conn.query(
      `SELECT
        p.*,
        u.full_name, u.phone_number, u.profile_picture${extraSelect},
        g.name as group_name, g.color_hex as group_color, g.icon as group_icon,
        (SELECT COUNT(*) FROM post_likes WHERE post_id=p.post_id AND type='like')::int    as likes,
        (SELECT COUNT(*) FROM post_likes WHERE post_id=p.post_id AND type='dislike')::int as dislikes,
        (SELECT COUNT(*) FROM comments    WHERE post_id=p.post_id AND is_deleted=0)::int  as comments,
        (SELECT COUNT(*) FROM posts sp WHERE sp.shared_post_id=p.post_id AND sp.is_deleted=0)::int as shares
       FROM posts p
       JOIN users u ON p.user_id=u.user_id
       LEFT JOIN groups g ON p.group_id=g.group_id
       WHERE p.is_deleted=0 AND ${visCond}${viewerUserId ? `
         AND NOT EXISTS (SELECT 1 FROM hidden_posts WHERE user_id=${viewerUserId} AND post_id=p.post_id)` : ''}
       ORDER BY p.created_at DESC
       LIMIT 60`
    );

    // Batch load all post images in one query instead of N queries
    const postIds = posts.map(p => p.post_id);
    const imgsByPost = {};
    if (postIds.length > 0) {
      const { rows: allImgs } = await conn.query(
        'SELECT post_id, image_url FROM post_images WHERE post_id = ANY($1)',
        [postIds]
      );
      for (const img of allImgs) {
        if (!imgsByPost[img.post_id]) imgsByPost[img.post_id] = [];
        imgsByPost[img.post_id].push(resolveUrl(img.image_url));
      }
    }

    // Batch load linked articles
    const linkedArticleIds = posts.filter(p => p.linked_article_id).map(p => p.linked_article_id);
    const articlesByid = {};
    if (linkedArticleIds.length > 0) {
      const { rows: artRows } = await conn.query(
        `SELECT article_id, title, author_name, cover_image, summary, category
         FROM articles WHERE article_id = ANY($1) AND is_deleted = 0 AND status = 'approved'`,
        [linkedArticleIds]
      );
      for (const art of artRows) {
        art.cover_image_url = resolveUrl(art.cover_image);
        articlesByid[art.article_id] = art;
      }
    }

    for (let post of posts) {
      if (post.created_at) {
        post.created_at = new Date(post.created_at).toISOString();
      }

      post.images = imgsByPost[post.post_id] || [];
      post.profile_picture_url = resolveUrl(post.profile_picture);
      post.shared_post = await getOriginalPost(conn, post.shared_post_id);
      post.linked_article = post.linked_article_id ? (articlesByid[post.linked_article_id] || null) : null;
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

// ─── GET SINGLE POST (for shared-post deep links) ───
exports.getPostById = async (req, res) => {
  try {
    const postId = Number(req.params.id);
    if (!Number.isFinite(postId) || postId <= 0) {
      return res.status(400).json({ error: 'Invalid post id' });
    }

    const conn = await pool.connect();
    await ensureHiddenPostsTable(conn);
    const phone = req.query.phone;

    let viewerUserId = null;
    if (phone) {
      const { rows: vr } = await conn.query('SELECT user_id FROM users WHERE phone_number=$1', [phone]);
      if (vr.length) viewerUserId = Number(vr[0].user_id);
    }

    let extraSelect = '';
    if (viewerUserId) {
      extraSelect = `,
      (SELECT type FROM post_likes
       WHERE post_id=p.post_id AND user_id=${viewerUserId}) as user_like`;
    }

    const visCond = visibilityCondition(viewerUserId);

    const { rows: posts } = await conn.query(
      `SELECT
        p.*,
        u.full_name, u.phone_number, u.profile_picture${extraSelect},
        g.name as group_name, g.color_hex as group_color, g.icon as group_icon,
        (SELECT COUNT(*) FROM post_likes WHERE post_id=p.post_id AND type='like')::int    as likes,
        (SELECT COUNT(*) FROM post_likes WHERE post_id=p.post_id AND type='dislike')::int as dislikes,
        (SELECT COUNT(*) FROM comments    WHERE post_id=p.post_id AND is_deleted=0)::int  as comments,
        (SELECT COUNT(*) FROM posts sp WHERE sp.shared_post_id=p.post_id AND sp.is_deleted=0)::int as shares
       FROM posts p
       JOIN users u ON p.user_id=u.user_id
       LEFT JOIN groups g ON p.group_id=g.group_id
       WHERE p.post_id=$1 AND p.is_deleted=0 AND ${visCond}`,
      [postId]
    );

    if (!posts.length) {
      conn.release();
      return res.status(404).json({ error: 'Post not found' });
    }

    const post = posts[0];
    const { rows: imgs } = await conn.query('SELECT image_url FROM post_images WHERE post_id=$1', [postId]);
    post.images = imgs.map(i => resolveUrl(i.image_url));
    post.profile_picture_url = resolveUrl(post.profile_picture);
    post.shared_post = await getOriginalPost(conn, post.shared_post_id);

    if (post.linked_article_id) {
      const { rows: artRows } = await conn.query(
        `SELECT article_id, title, author_name, cover_image, summary, category
         FROM articles WHERE article_id=$1 AND is_deleted=0 AND status='approved'`,
        [post.linked_article_id]
      );
      if (artRows.length) {
        artRows[0].cover_image_url = resolveUrl(artRows[0].cover_image);
        post.linked_article = artRows[0];
      } else {
        post.linked_article = null;
      }
    } else {
      post.linked_article = null;
    }

    if (post.created_at) post.created_at = new Date(post.created_at).toISOString();

    conn.release();

    res.json({
      ...post,
      likes: Number(post.likes),
      dislikes: Number(post.dislikes),
      comments: Number(post.comments),
      shares: Number(post.shares),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

// ─── LIKE POST ───
exports.likePost = async (req, res) => {
  try {
    const postId = req.params.id;
    const { phone, type } = req.body;
    const conn = await pool.connect();

    const guard = await assertUserCanInteract(conn, phone);
    if (!guard.allowed) {
      conn.release();
      return res.status(guard.statusCode).json(guard.payload);
    }

    const { rows: user } = await conn.query('SELECT user_id FROM users WHERE phone_number=$1', [phone]);
    if (!user.length) { conn.release(); return res.status(404).json({ error: 'User not found' }); }
    const userId = user[0].user_id;
    if (type === 'remove' || type === 'unlike') {
      await conn.query('DELETE FROM post_likes WHERE post_id=$1 AND user_id=$2', [postId, userId]);
    } else {
      await conn.query(
        'INSERT INTO post_likes(post_id,user_id,type) VALUES($1,$2,$3) ON CONFLICT (post_id,user_id) DO UPDATE SET type=$3',
        [postId, userId, type]
      );
    }
    const { rows: post } = await conn.query('SELECT user_id FROM posts WHERE post_id=$1', [postId]);
    if (post.length) {
      await conn.query("INSERT INTO notifications(user_id,actor_id,post_id,type) VALUES($1,$2,$3,'like')",
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

    const conn = await pool.connect();
    const { rows: user } = await conn.query('SELECT user_id FROM users WHERE phone_number=$1', [phone]);
    if (!user.length) { conn.release(); return res.status(404).json({ error: 'User not found' }); }
    const userId = user[0].user_id;

    await ensureHiddenPostsTable(conn);

    await conn.query(
      'INSERT INTO hidden_posts (user_id, post_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
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

    conn = await pool.connect();
    await ensurePostReportTable(conn);

    const { rows: userRows } = await conn.query(
      'SELECT user_id FROM users WHERE phone_number=$1 LIMIT 1',
      [phone]
    );
    if (!userRows.length) {
      return res.status(404).json({ error: 'User not found' });
    }
    const reporterUserId = Number(userRows[0].user_id);

    const { rows: postRows } = await conn.query(
      'SELECT user_id, is_deleted FROM posts WHERE post_id=$1 LIMIT 1',
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
       VALUES($1,$2,$3,$4)
       ON CONFLICT (post_id, reporter_user_id) DO UPDATE SET
         reason=EXCLUDED.reason,
         detail=EXCLUDED.detail,
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
    const conn = await pool.connect();
    const { rows: user } = await conn.query('SELECT user_id, full_name FROM users WHERE phone_number=$1', [phone]);
    if (!user.length) { conn.release(); return res.status(404).json({ error: 'User not found' }); }
    const userId   = Number(user[0].user_id);
    const userName = user[0].full_name || phone;
    const { rows: post } = await conn.query('SELECT user_id FROM posts WHERE post_id=$1', [postId]);
    if (!post.length) { conn.release(); return res.status(404).json({ error: 'Post not found' }); }
    if (Number(post[0].user_id) !== userId) { conn.release(); return res.status(403).json({ error: 'Forbidden' }); }
    const valid   = ['public', 'friends', 'followers', 'only_me'];
    const safeVis = valid.includes(visibility) ? visibility : 'public';
    await conn.query('UPDATE posts SET content=$1, visibility=$2 WHERE post_id=$3', [content, safeVis, postId]);
    if (req.files && req.files.length > 0) {
      await conn.query('DELETE FROM post_images WHERE post_id=$1', [postId]);
      for (const file of req.files) {
        const publicUrl = await uploadToStorage(file.buffer, file.originalname, file.mimetype, 'posts');
        await conn.query('INSERT INTO post_images(post_id,image_url) VALUES($1,$2)', [postId, publicUrl]);
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
exports.deletePost = async (req, res) => {
  try {
    const postId = req.params.id;
    const phone  = req.query.phone;
    if (!phone) return res.status(400).json({ error: 'Phone required' });

    const conn = await pool.connect();

    const { rows: user } = await conn.query(
      'SELECT user_id FROM users WHERE phone_number=$1', [phone]
    );
    if (!user.length) { conn.release(); return res.status(404).json({ error: 'User not found' }); }
    const userId = Number(user[0].user_id);

    const { rows: post } = await conn.query(
      'SELECT user_id, is_deleted FROM posts WHERE post_id=$1', [postId]
    );
    if (!post.length) { conn.release(); return res.status(404).json({ error: 'Post not found' }); }
    if (Number(post[0].user_id) !== userId) { conn.release(); return res.status(403).json({ error: 'Forbidden' }); }
    if (post[0].is_deleted) { conn.release(); return res.status(400).json({ error: 'Post already deleted' }); }

    await conn.query(
      'UPDATE posts SET is_deleted=1, deleted_at=NOW() WHERE post_id=$1',
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
exports.getDeletedPosts = async (req, res) => {
  try {
    const conn = await pool.connect();

    const { rows: posts } = await conn.query(
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
      const { rows: imgs } = await conn.query('SELECT image_url FROM post_images WHERE post_id=$1', [post.post_id]);
      post.images = imgs.map(i => resolveUrl(i.image_url));
      post.profile_picture_url = resolveUrl(post.profile_picture);
    }

    conn.release();

    res.json(posts.map(p => ({
      ...p,
      likes:    Number(p.likes),
      dislikes: Number(p.dislikes),
      comments: Number(p.comments),
      shares:   Number(p.shares),
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

// ─── ADMIN: RESTORE DELETED POST ───
exports.restorePost = async (req, res) => {
  try {
    const postId = req.params.id;
    const conn   = await pool.connect();

    const { rows: post } = await conn.query(
      'SELECT post_id, is_deleted FROM posts WHERE post_id=$1', [postId]
    );
    if (!post.length) { conn.release(); return res.status(404).json({ error: 'Post not found' }); }
    if (!post[0].is_deleted) { conn.release(); return res.status(400).json({ error: 'Post is not deleted' }); }

    await conn.query(
      'UPDATE posts SET is_deleted=0, deleted_at=NULL WHERE post_id=$1', [postId]
    );

    conn.release();
    res.json({ message: 'Post restored successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
