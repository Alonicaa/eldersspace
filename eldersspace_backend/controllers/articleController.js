const pool   = require('../config/db');
const multer = require('multer');
const path   = require('path');
const fs     = require('fs');

// ── Multer ──────────────────────────────────────────────────────────────────
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
exports.upload = multer({ storage: tmpStorage }).single('cover_image');

function moveToArticleFolder(tmpPath, articleId, filename) {
  const dir = `uploads/articles/${articleId}/`;
  fs.mkdirSync(dir, { recursive: true });
  const dest = dir + filename;
  fs.renameSync(tmpPath, dest);
  return `articles/${articleId}/${filename}`;
}

// ── Ensure tables exist ──────────────────────────────────────────────────────
async function ensureArticlesTable(conn) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS articles (
      article_id     INT AUTO_INCREMENT PRIMARY KEY,
      title          VARCHAR(255)  NOT NULL,
      author_name    VARCHAR(150)  NOT NULL,
      cover_image    VARCHAR(500)  NULL,
      summary        TEXT          NULL,
      headline       VARCHAR(500)  NULL,
      introduction   TEXT          NULL,
      body           LONGTEXT      NULL,
      conclusion     TEXT          NULL,
      category       ENUM('สุขภาพ','โภชนาการ','สมาธิ','จิตใจ') NOT NULL DEFAULT 'สุขภาพ',
      source_type    ENUM('partner','user')                     NOT NULL DEFAULT 'user',
      submitted_by_user_id INT     NULL,
      partner_name   VARCHAR(255)  NULL,
      badge_label    VARCHAR(100)  NULL,
      is_featured    TINYINT(1)    NOT NULL DEFAULT 0,
      like_count     INT           NOT NULL DEFAULT 0,
      comment_count  INT           NOT NULL DEFAULT 0,
      share_count    INT           NOT NULL DEFAULT 0,
      view_count     INT           NOT NULL DEFAULT 0,
      status         ENUM('pending','approved','rejected')      NOT NULL DEFAULT 'pending',
      is_deleted     TINYINT(1)    NOT NULL DEFAULT 0,
      created_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Add counter columns to existing tables (idempotent)
  for (const col of ['like_count','comment_count','share_count','view_count']) {
    try {
      await conn.query(`ALTER TABLE articles ADD COLUMN ${col} INT NOT NULL DEFAULT 0`);
    } catch (e) { /* already exists */ }
  }
  try {
    await conn.query(`ALTER TABLE articles ADD COLUMN approved_at DATETIME NULL DEFAULT NULL`);
  } catch (e) { /* already exists */ }
  // Backfill approved_at for previously approved articles using updated_at as proxy
  await conn.query(
    `UPDATE articles SET approved_at = updated_at WHERE status = 'approved' AND approved_at IS NULL AND is_deleted = 0`
  );

  await conn.query(`
    CREATE TABLE IF NOT EXISTS article_likes (
      like_id    INT AUTO_INCREMENT PRIMARY KEY,
      article_id INT NOT NULL,
      user_id    INT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_al (article_id, user_id),
      INDEX idx_al_article (article_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS article_comments (
      comment_id INT AUTO_INCREMENT PRIMARY KEY,
      article_id INT NOT NULL,
      user_id    INT NOT NULL,
      content    TEXT NOT NULL,
      is_deleted TINYINT(1) NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_ac_article (article_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

// ── GET /api/articles ────────────────────────────────────────────────────────
exports.getApprovedArticles = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await ensureArticlesTable(conn);
    const { category, page = 1, limit = 20, phone, sort } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let userIdSub = 'NULL';
    if (phone) {
      const [[u]] = await conn.query(
        'SELECT user_id FROM users WHERE phone_number=?', [phone]
      );
      if (u) userIdSub = u.user_id;
    }

    const params = [];
    let catClause = '';
    if (category) { catClause = 'AND a.category = ?'; params.push(category); }
    params.push(Number(limit), offset);

    const orderClause = sort === 'popular'
      ? 'ORDER BY (a.view_count + a.like_count * 2) DESC, a.created_at DESC'
      : 'ORDER BY a.is_featured DESC, a.created_at DESC';

    const [rows] = await conn.query(
      `SELECT a.article_id, a.title, a.author_name, a.cover_image,
              a.summary, a.category, a.source_type, a.partner_name,
              a.badge_label, a.is_featured, a.created_at,
              a.like_count, a.comment_count, a.share_count, a.view_count,
              u.full_name AS submitter_name,
              ${userIdSub !== 'NULL'
                ? `(SELECT COUNT(*) FROM article_likes WHERE article_id=a.article_id AND user_id=${userIdSub})`
                : '0'
              } AS user_liked
       FROM articles a
       LEFT JOIN users u ON u.user_id = a.submitted_by_user_id
       WHERE a.status = 'approved' AND a.is_deleted = 0
       ${catClause}
       ${orderClause}
       LIMIT ? OFFSET ?`,
      params
    );
    res.json(rows);
  } catch (err) {
    console.error('[Articles] getApprovedArticles', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    conn.release();
  }
};

// ── GET /api/articles/:id ────────────────────────────────────────────────────
exports.getArticleById = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await ensureArticlesTable(conn);
    const { phone } = req.query;

    let userIdSub = 'NULL';
    if (phone) {
      const [[u]] = await conn.query(
        'SELECT user_id FROM users WHERE phone_number=?', [phone]
      );
      if (u) userIdSub = u.user_id;
    }

    const [rows] = await conn.query(
      `SELECT a.*, u.full_name AS submitter_name,
              ${userIdSub !== 'NULL'
                ? `(SELECT COUNT(*) FROM article_likes WHERE article_id=a.article_id AND user_id=${userIdSub})`
                : '0'
              } AS user_liked
       FROM articles a
       LEFT JOIN users u ON u.user_id = a.submitted_by_user_id
       WHERE a.article_id = ? AND a.status = 'approved' AND a.is_deleted = 0`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[Articles] getArticleById', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    conn.release();
  }
};

// ── POST /api/articles/submit  (user submits, goes to pending) ───────────────
exports.submitUserArticle = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await ensureArticlesTable(conn);
    const {
      phone_number, title, author_name, summary,
      headline, introduction, body, conclusion, category
    } = req.body;

    if (!title || !author_name) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'title and author_name required' });
    }

    const [userRows] = await conn.query(
      'SELECT user_id, full_name FROM users WHERE phone_number = ?',
      [phone_number]
    );
    if (!userRows.length) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(404).json({ error: 'User not found' });
    }
    const userId = userRows[0].user_id;
    // Always use the account's full_name — never trust user-submitted author_name
    const resolvedAuthorName = userRows[0].full_name || author_name;

    const [ins] = await conn.query(
      `INSERT INTO articles
         (title, author_name, summary, headline, introduction, body, conclusion,
          category, source_type, submitted_by_user_id, badge_label, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'user', ?, 'นักเขียนมือทอง', 'pending')`,
      [
        title, resolvedAuthorName, summary || null, headline || null,
        introduction || null, body || null, conclusion || null,
        category || 'สุขภาพ', userId
      ]
    );
    const articleId = ins.insertId;

    let coverPath = null;
    if (req.file) {
      coverPath = moveToArticleFolder(req.file.path, articleId, req.file.filename);
      await conn.query('UPDATE articles SET cover_image = ? WHERE article_id = ?', [coverPath, articleId]);
    }

    res.status(201).json({ success: true, article_id: articleId, status: 'pending' });
  } catch (err) {
    if (req.file) try { fs.unlinkSync(req.file.path); } catch (_) {}
    console.error('[Articles] submitUserArticle', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    conn.release();
  }
};

// ── GET /api/articles/my/:phone  (user's own submissions) ───────────────────
exports.getMyArticles = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await ensureArticlesTable(conn);
    const [userRows] = await conn.query(
      'SELECT user_id FROM users WHERE phone_number = ?',
      [req.params.phone]
    );
    if (!userRows.length) return res.json([]);
    const [rows] = await conn.query(
      `SELECT article_id, title, cover_image, summary, category,
              status, created_at
       FROM articles
       WHERE submitted_by_user_id = ? AND is_deleted = 0
       ORDER BY created_at DESC`,
      [userRows[0].user_id]
    );
    res.json(rows);
  } catch (err) {
    console.error('[Articles] getMyArticles', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    conn.release();
  }
};

// ─── ADMIN ──────────────────────────────────────────────────────────────────

// POST /api/admin/articles  (admin posts partner article, auto-approved)
exports.adminCreateArticle = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await ensureArticlesTable(conn);
    const {
      title, summary, headline, introduction,
      body, conclusion, category, partner_name, is_featured
    } = req.body;

    if (!title || !partner_name) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'title and partner_name required' });
    }

    // author_name is always derived from partner_name for partner articles
    const author_name = partner_name;

    const [ins] = await conn.query(
      `INSERT INTO articles
         (title, author_name, summary, headline, introduction, body, conclusion,
          category, source_type, partner_name, badge_label, is_featured, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'partner', ?, 'ได้รับการสนับสนุน', ?, 'approved')`,
      [
        title, author_name, summary || null, headline || null,
        introduction || null, body || null, conclusion || null,
        category || 'สุขภาพ', partner_name, is_featured ? 1 : 0
      ]
    );
    const articleId = ins.insertId;

    let coverPath = null;
    if (req.file) {
      coverPath = moveToArticleFolder(req.file.path, articleId, req.file.filename);
      await conn.query('UPDATE articles SET cover_image = ? WHERE article_id = ?', [coverPath, articleId]);
    }

    res.status(201).json({ success: true, article_id: articleId });
  } catch (err) {
    if (req.file) try { fs.unlinkSync(req.file.path); } catch (_) {}
    console.error('[Articles] adminCreateArticle', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    conn.release();
  }
};

// PUT /api/admin/articles/:id
exports.adminUpdateArticle = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await ensureArticlesTable(conn);
    const {
      title, summary, headline, introduction,
      body, conclusion, category, partner_name, is_featured
    } = req.body;

    if (!title) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'title required' });
    }

    const sets = [
      'title = ?', 'summary = ?', 'headline = ?', 'introduction = ?',
      'body = ?', 'conclusion = ?', 'category = ?', 'partner_name = ?',
      'updated_at = NOW()'
    ];
    const vals = [
      title, summary || null, headline || null, introduction || null,
      body || null, conclusion || null, category || 'สุขภาพ',
      partner_name || null
    ];
    if (partner_name) {
      sets.splice(sets.length - 1, 0, 'author_name = ?');
      vals.splice(vals.length, 0, partner_name);
    }

    if (req.file) {
      const articleId = req.params.id;
      const coverPath = moveToArticleFolder(req.file.path, articleId, req.file.filename);
      sets.push('cover_image = ?');
      vals.push(coverPath);
    }

    vals.push(req.params.id);
    await conn.query(
      `UPDATE articles SET ${sets.join(', ')} WHERE article_id = ? AND is_deleted = 0`,
      vals
    );
    res.json({ success: true });
  } catch (err) {
    if (req.file) try { fs.unlinkSync(req.file.path); } catch (_) {}
    console.error('[Articles] adminUpdateArticle', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    conn.release();
  }
};

// GET /api/admin/articles
exports.adminGetAllArticles = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await ensureArticlesTable(conn);
    const { status, source_type, partner_name, page = 1, limit = 50 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    const params = [];
    const clauses = ['a.is_deleted = 0'];
    if (status) { clauses.push('a.status = ?'); params.push(status); }
    if (source_type) { clauses.push('a.source_type = ?'); params.push(source_type); }
    if (partner_name) { clauses.push('a.partner_name = ?'); params.push(partner_name); }
    params.push(Number(limit), offset);

    const [rows] = await conn.query(
      `SELECT a.article_id, a.title, a.author_name, a.cover_image, a.summary,
              a.category, a.source_type, a.partner_name, a.badge_label,
              a.is_featured, a.status, a.created_at,
              a.like_count, a.comment_count, a.share_count, a.view_count,
              u.full_name AS submitter_name, u.phone_number AS submitter_phone
       FROM articles a
       LEFT JOIN users u ON u.user_id = a.submitted_by_user_id
       WHERE ${clauses.join(' AND ')}
       ORDER BY a.created_at DESC
       LIMIT ? OFFSET ?`,
      params
    );

    const [[{ total }]] = await conn.query(
      `SELECT COUNT(*) AS total FROM articles a WHERE ${clauses.join(' AND ')}`,
      params.slice(0, -2)
    );

    res.json({ articles: rows, total });
  } catch (err) {
    console.error('[Articles] adminGetAllArticles', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    conn.release();
  }
};

// PATCH /api/admin/articles/:id/approve
exports.adminApproveArticle = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await ensureArticlesTable(conn);
    await conn.query(
      "UPDATE articles SET status = 'approved', approved_at = NOW() WHERE article_id = ? AND is_deleted = 0",
      [req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[Articles] adminApproveArticle', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    conn.release();
  }
};

// PATCH /api/admin/articles/:id/reject
exports.adminRejectArticle = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await ensureArticlesTable(conn);
    await conn.query(
      "UPDATE articles SET status = 'rejected' WHERE article_id = ? AND is_deleted = 0",
      [req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[Articles] adminRejectArticle', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    conn.release();
  }
};

// DELETE /api/admin/articles/:id  (soft delete)
exports.adminDeleteArticle = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await ensureArticlesTable(conn);
    await conn.query(
      'UPDATE articles SET is_deleted = 1 WHERE article_id = ?',
      [req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[Articles] adminDeleteArticle', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    conn.release();
  }
};

// GET /api/admin/articles/:id
exports.adminGetArticleById = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await ensureArticlesTable(conn);
    const [rows] = await conn.query(
      `SELECT a.*, u.full_name AS submitter_name, u.phone_number AS submitter_phone
       FROM articles a
       LEFT JOIN users u ON u.user_id = a.submitted_by_user_id
       WHERE a.article_id = ? AND a.is_deleted = 0`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[Articles] adminGetArticleById', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    conn.release();
  }
};

// ─── INTERACTIONS ────────────────────────────────────────────────────────────

// POST /api/articles/:id/view  — increment view count (called when detail page opens)
exports.viewArticle = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await ensureArticlesTable(conn);
    await conn.query(
      'UPDATE articles SET view_count = view_count + 1 WHERE article_id = ? AND is_deleted = 0',
      [req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[Articles] viewArticle', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    conn.release();
  }
};

// POST /api/articles/:id/like  — toggle like (phone in body)
exports.likeArticle = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await ensureArticlesTable(conn);
    const { phone_number } = req.body;
    if (!phone_number) return res.status(400).json({ error: 'phone_number required' });

    const [[user]] = await conn.query(
      'SELECT user_id FROM users WHERE phone_number = ?', [phone_number]
    );
    if (!user) return res.status(404).json({ error: 'User not found' });

    const [[existing]] = await conn.query(
      'SELECT like_id FROM article_likes WHERE article_id = ? AND user_id = ?',
      [req.params.id, user.user_id]
    );

    let liked;
    if (existing) {
      await conn.query(
        'DELETE FROM article_likes WHERE article_id = ? AND user_id = ?',
        [req.params.id, user.user_id]
      );
      await conn.query(
        'UPDATE articles SET like_count = GREATEST(0, like_count - 1) WHERE article_id = ?',
        [req.params.id]
      );
      liked = false;
    } else {
      await conn.query(
        'INSERT INTO article_likes (article_id, user_id) VALUES (?, ?)',
        [req.params.id, user.user_id]
      );
      await conn.query(
        'UPDATE articles SET like_count = like_count + 1 WHERE article_id = ?',
        [req.params.id]
      );
      liked = true;
    }

    const [[{ like_count }]] = await conn.query(
      'SELECT like_count FROM articles WHERE article_id = ?', [req.params.id]
    );
    res.json({ success: true, liked, like_count });
  } catch (err) {
    console.error('[Articles] likeArticle', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    conn.release();
  }
};

// POST /api/articles/:id/share
exports.shareArticle = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await ensureArticlesTable(conn);
    await conn.query(
      'UPDATE articles SET share_count = share_count + 1 WHERE article_id = ? AND is_deleted = 0',
      [req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[Articles] shareArticle', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    conn.release();
  }
};

// GET /api/articles/:id/comments
exports.getArticleComments = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await ensureArticlesTable(conn);
    const backendUrl = process.env.BACKEND_URL || 'http://10.0.2.2:3000';
    const [rows] = await conn.query(
      `SELECT ac.comment_id, ac.article_id, ac.user_id, ac.content, ac.created_at,
              u.full_name,
              CASE WHEN u.profile_picture IS NULL OR u.profile_picture=''
                   THEN NULL
                   ELSE CONCAT(?, '/uploads/', u.profile_picture)
              END AS profile_picture_url
       FROM article_comments ac
       JOIN users u ON u.user_id = ac.user_id
       WHERE ac.article_id = ? AND ac.is_deleted = 0
       ORDER BY ac.created_at ASC`,
      [backendUrl, req.params.id]
    );
    res.json(rows);
  } catch (err) {
    console.error('[Articles] getArticleComments', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    conn.release();
  }
};

// POST /api/articles/:id/comments
exports.addArticleComment = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await ensureArticlesTable(conn);
    const { phone_number, content } = req.body;
    if (!content || !content.trim()) return res.status(400).json({ error: 'content required' });
    if (!phone_number) return res.status(400).json({ error: 'phone_number required' });

    const [[user]] = await conn.query(
      'SELECT user_id, full_name, profile_picture FROM users WHERE phone_number = ?',
      [phone_number]
    );
    if (!user) return res.status(404).json({ error: 'User not found' });

    const [ins] = await conn.query(
      'INSERT INTO article_comments (article_id, user_id, content) VALUES (?, ?, ?)',
      [req.params.id, user.user_id, content.trim()]
    );
    await conn.query(
      'UPDATE articles SET comment_count = comment_count + 1 WHERE article_id = ?',
      [req.params.id]
    );

    const backendUrl = process.env.BACKEND_URL || 'http://10.0.2.2:3000';
    res.status(201).json({
      comment_id: ins.insertId,
      article_id: Number(req.params.id),
      user_id: user.user_id,
      content: content.trim(),
      created_at: new Date(),
      full_name: user.full_name,
      profile_picture_url: user.profile_picture
        ? `${backendUrl}/uploads/${user.profile_picture}` : null,
    });
  } catch (err) {
    console.error('[Articles] addArticleComment', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    conn.release();
  }
};

// DELETE /api/articles/:id/comments/:cid  (soft delete, owner only)
exports.deleteArticleComment = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await ensureArticlesTable(conn);
    const { phone_number } = req.body;
    if (!phone_number) return res.status(400).json({ error: 'phone_number required' });

    const [[user]] = await conn.query(
      'SELECT user_id FROM users WHERE phone_number = ?', [phone_number]
    );
    if (!user) return res.status(404).json({ error: 'User not found' });

    const [[comment]] = await conn.query(
      'SELECT comment_id FROM article_comments WHERE comment_id = ? AND user_id = ? AND is_deleted = 0',
      [req.params.cid, user.user_id]
    );
    if (!comment) return res.status(403).json({ error: 'Not allowed' });

    await conn.query(
      'UPDATE article_comments SET is_deleted = 1 WHERE comment_id = ?', [req.params.cid]
    );
    await conn.query(
      'UPDATE articles SET comment_count = GREATEST(0, comment_count - 1) WHERE article_id = ?',
      [req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[Articles] deleteArticleComment', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    conn.release();
  }
};

// ── GET /api/articles/user/:userId ──────────────────────────────────────────
exports.getArticlesByUser = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await ensureArticlesTable(conn);
    const userId = Number(req.params.userId);
    if (!userId) return res.status(400).json({ error: 'Invalid user id' });

    const [rows] = await conn.query(`
      SELECT a.article_id, a.title, a.author_name, a.cover_image,
             a.summary, a.category, a.created_at,
             a.like_count, a.comment_count, a.share_count, a.view_count
      FROM articles a
      WHERE a.submitted_by_user_id = ?
        AND a.status      = 'approved'
        AND a.is_deleted  = 0
        AND a.source_type = 'user'
      ORDER BY a.created_at DESC
    `, [userId]);

    res.json(rows);
  } catch (err) {
    console.error('[Articles] getArticlesByUser', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    conn.release();
  }
};

// ── GET /api/articles/ranking ────────────────────────────────────────────────
exports.getArticleRanking = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await ensureArticlesTable(conn);
    const limit = Math.min(Number(req.query.limit) || 50, 100);

    const [rows] = await conn.query(`
      SELECT
        u.user_id,
        u.full_name,
        u.profile_picture AS profile_image,
        COUNT(DISTINCT a.article_id)          AS article_count,
        COALESCE(SUM(a.like_count),   0)      AS total_likes,
        COALESCE(SUM(a.share_count),  0)      AS total_shares,
        COALESCE(SUM(a.view_count),   0)      AS total_views,
        COALESCE(SUM(a.comment_count),0)      AS total_comments,
        (
          COALESCE(SUM(a.like_count),    0) +
          COALESCE(SUM(a.share_count),   0) +
          COALESCE(SUM(a.comment_count), 0)
        ) AS score
      FROM users u
      JOIN articles a
        ON a.submitted_by_user_id = u.user_id
       AND a.status      = 'approved'
       AND a.is_deleted  = 0
       AND a.source_type = 'user'
      GROUP BY u.user_id
      HAVING score > 0 OR article_count > 0
      ORDER BY score DESC, total_likes DESC
      LIMIT ?
    `, [limit]);

    res.json({ ranking: rows });
  } catch (err) {
    console.error('[Articles] getArticleRanking', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    conn.release();
  }
};
