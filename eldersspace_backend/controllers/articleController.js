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
      article_id     SERIAL PRIMARY KEY,
      title          VARCHAR(255)  NOT NULL,
      author_name    VARCHAR(150)  NOT NULL,
      cover_image    VARCHAR(500)  NULL,
      summary        TEXT          NULL,
      headline       VARCHAR(500)  NULL,
      introduction   TEXT          NULL,
      body           TEXT          NULL,
      conclusion     TEXT          NULL,
      category       VARCHAR(50)   NOT NULL DEFAULT 'สุขภาพ',
      source_type    VARCHAR(20)   NOT NULL DEFAULT 'user',
      submitted_by_user_id INT     NULL,
      partner_name   VARCHAR(255)  NULL,
      badge_label    VARCHAR(100)  NULL,
      is_featured    SMALLINT      NOT NULL DEFAULT 0,
      like_count     INT           NOT NULL DEFAULT 0,
      comment_count  INT           NOT NULL DEFAULT 0,
      share_count    INT           NOT NULL DEFAULT 0,
      view_count     INT           NOT NULL DEFAULT 0,
      status         VARCHAR(20)   NOT NULL DEFAULT 'pending',
      is_deleted     SMALLINT      NOT NULL DEFAULT 0,
      created_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Add counter columns to existing tables (idempotent)
  for (const col of ['like_count','comment_count','share_count','view_count']) {
    try {
      await conn.query(`ALTER TABLE articles ADD COLUMN ${col} INT NOT NULL DEFAULT 0`);
    } catch (e) { /* already exists */ }
  }
  try {
    await conn.query(`ALTER TABLE articles ADD COLUMN approved_at TIMESTAMP NULL DEFAULT NULL`);
  } catch (e) { /* already exists */ }
  await conn.query(
    `UPDATE articles SET approved_at = updated_at WHERE status = 'approved' AND approved_at IS NULL AND is_deleted = 0`
  );

  await conn.query(`
    CREATE TABLE IF NOT EXISTS article_likes (
      like_id    SERIAL PRIMARY KEY,
      article_id INT NOT NULL,
      user_id    INT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (article_id, user_id)
    )
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS article_comments (
      comment_id SERIAL PRIMARY KEY,
      article_id INT NOT NULL,
      user_id    INT NOT NULL,
      content    TEXT NOT NULL,
      is_deleted SMALLINT NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

// ── GET /api/articles ────────────────────────────────────────────────────────
exports.getApprovedArticles = async (req, res) => {
  const conn = await pool.connect();
  try {
    await ensureArticlesTable(conn);
    const { category, page = 1, limit = 20, phone, sort } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let userIdSub = 'NULL';
    if (phone) {
      const { rows: uRows } = await conn.query(
        'SELECT user_id FROM users WHERE phone_number=$1', [phone]
      );
      if (uRows[0]) userIdSub = uRows[0].user_id;
    }

    const params = [];
    let catClause = '';
    if (category) { params.push(category); catClause = `AND a.category = $${params.length}`; }
    params.push(Number(limit), offset);
    const limitIdx = params.length - 1;
    const offsetIdx = params.length;

    const orderClause = sort === 'popular'
      ? 'ORDER BY (a.view_count + a.like_count * 2) DESC, a.created_at DESC'
      : 'ORDER BY a.is_featured DESC, a.created_at DESC';

    const { rows } = await conn.query(
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
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
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
  const conn = await pool.connect();
  try {
    await ensureArticlesTable(conn);
    const { phone } = req.query;

    let userIdSub = 'NULL';
    if (phone) {
      const { rows: uRows } = await conn.query(
        'SELECT user_id FROM users WHERE phone_number=$1', [phone]
      );
      if (uRows[0]) userIdSub = uRows[0].user_id;
    }

    const { rows } = await conn.query(
      `SELECT a.*, u.full_name AS submitter_name,
              ${userIdSub !== 'NULL'
                ? `(SELECT COUNT(*) FROM article_likes WHERE article_id=a.article_id AND user_id=${userIdSub})`
                : '0'
              } AS user_liked
       FROM articles a
       LEFT JOIN users u ON u.user_id = a.submitted_by_user_id
       WHERE a.article_id = $1 AND a.status = 'approved' AND a.is_deleted = 0`,
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

// ── POST /api/articles/submit ───────────────────────────────────────────────
exports.submitUserArticle = async (req, res) => {
  const conn = await pool.connect();
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

    const { rows: userRows } = await conn.query(
      'SELECT user_id, full_name FROM users WHERE phone_number = $1',
      [phone_number]
    );
    if (!userRows.length) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(404).json({ error: 'User not found' });
    }
    const userId = userRows[0].user_id;
    const resolvedAuthorName = userRows[0].full_name || author_name;

    const { rows: ins } = await conn.query(
      `INSERT INTO articles
         (title, author_name, summary, headline, introduction, body, conclusion,
          category, source_type, submitted_by_user_id, badge_label, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'user', $9, 'นักเขียนมือทอง', 'pending')
       RETURNING article_id`,
      [
        title, resolvedAuthorName, summary || null, headline || null,
        introduction || null, body || null, conclusion || null,
        category || 'สุขภาพ', userId
      ]
    );
    const articleId = ins[0].article_id;

    let coverPath = null;
    if (req.file) {
      coverPath = moveToArticleFolder(req.file.path, articleId, req.file.filename);
      await conn.query('UPDATE articles SET cover_image = $1 WHERE article_id = $2', [coverPath, articleId]);
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

// ── GET /api/articles/my/:phone ─────────────────────────────────────────────
exports.getMyArticles = async (req, res) => {
  const conn = await pool.connect();
  try {
    await ensureArticlesTable(conn);
    const { rows: userRows } = await conn.query(
      'SELECT user_id FROM users WHERE phone_number = $1',
      [req.params.phone]
    );
    if (!userRows.length) return res.json([]);
    const { rows } = await conn.query(
      `SELECT article_id, title, cover_image, summary, category,
              status, created_at
       FROM articles
       WHERE submitted_by_user_id = $1 AND is_deleted = 0
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

exports.adminCreateArticle = async (req, res) => {
  const conn = await pool.connect();
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

    const author_name = partner_name;

    const { rows: ins } = await conn.query(
      `INSERT INTO articles
         (title, author_name, summary, headline, introduction, body, conclusion,
          category, source_type, partner_name, badge_label, is_featured, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'partner', $9, 'ได้รับการสนับสนุน', $10, 'approved')
       RETURNING article_id`,
      [
        title, author_name, summary || null, headline || null,
        introduction || null, body || null, conclusion || null,
        category || 'สุขภาพ', partner_name, is_featured ? 1 : 0
      ]
    );
    const articleId = ins[0].article_id;

    let coverPath = null;
    if (req.file) {
      coverPath = moveToArticleFolder(req.file.path, articleId, req.file.filename);
      await conn.query('UPDATE articles SET cover_image = $1 WHERE article_id = $2', [coverPath, articleId]);
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

exports.adminUpdateArticle = async (req, res) => {
  const conn = await pool.connect();
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

    // Build dynamic SET clause with pg numbered placeholders
    const sets = [];
    const vals = [];
    let idx = 1;

    const addField = (col, val) => { sets.push(`${col} = $${idx++}`); vals.push(val); };
    addField('title', title);
    addField('summary', summary || null);
    addField('headline', headline || null);
    addField('introduction', introduction || null);
    addField('body', body || null);
    addField('conclusion', conclusion || null);
    addField('category', category || 'สุขภาพ');
    addField('partner_name', partner_name || null);
    if (partner_name) addField('author_name', partner_name);
    sets.push('updated_at = NOW()');

    if (req.file) {
      const articleId = req.params.id;
      const coverPath = moveToArticleFolder(req.file.path, articleId, req.file.filename);
      addField('cover_image', coverPath);
    }

    vals.push(req.params.id);
    await conn.query(
      `UPDATE articles SET ${sets.join(', ')} WHERE article_id = $${idx} AND is_deleted = 0`,
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

exports.adminGetAllArticles = async (req, res) => {
  const conn = await pool.connect();
  try {
    await ensureArticlesTable(conn);
    const { status, source_type, partner_name, page = 1, limit = 50 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    const params = [];
    const clauses = ['a.is_deleted = 0'];
    let idx = 1;
    if (status)       { clauses.push(`a.status = $${idx++}`);       params.push(status); }
    if (source_type)  { clauses.push(`a.source_type = $${idx++}`);  params.push(source_type); }
    if (partner_name) { clauses.push(`a.partner_name = $${idx++}`); params.push(partner_name); }
    params.push(Number(limit), offset);
    const limitIdx = idx++;
    const offsetIdx = idx;

    const { rows } = await conn.query(
      `SELECT a.article_id, a.title, a.author_name, a.cover_image, a.summary,
              a.category, a.source_type, a.partner_name, a.badge_label,
              a.is_featured, a.status, a.created_at,
              a.like_count, a.comment_count, a.share_count, a.view_count,
              u.full_name AS submitter_name, u.phone_number AS submitter_phone
       FROM articles a
       LEFT JOIN users u ON u.user_id = a.submitted_by_user_id
       WHERE ${clauses.join(' AND ')}
       ORDER BY a.created_at DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params
    );

    const { rows: countRows } = await conn.query(
      `SELECT COUNT(*) AS total FROM articles a WHERE ${clauses.join(' AND ')}`,
      params.slice(0, -2)
    );

    res.json({ articles: rows, total: Number(countRows[0].total) });
  } catch (err) {
    console.error('[Articles] adminGetAllArticles', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    conn.release();
  }
};

exports.adminApproveArticle = async (req, res) => {
  const conn = await pool.connect();
  try {
    await ensureArticlesTable(conn);
    await conn.query(
      "UPDATE articles SET status = 'approved', approved_at = NOW() WHERE article_id = $1 AND is_deleted = 0",
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

exports.adminRejectArticle = async (req, res) => {
  const conn = await pool.connect();
  try {
    await ensureArticlesTable(conn);
    await conn.query(
      "UPDATE articles SET status = 'rejected' WHERE article_id = $1 AND is_deleted = 0",
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

exports.adminDeleteArticle = async (req, res) => {
  const conn = await pool.connect();
  try {
    await ensureArticlesTable(conn);
    await conn.query(
      'UPDATE articles SET is_deleted = 1 WHERE article_id = $1',
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

exports.adminGetArticleById = async (req, res) => {
  const conn = await pool.connect();
  try {
    await ensureArticlesTable(conn);
    const { rows } = await conn.query(
      `SELECT a.*, u.full_name AS submitter_name, u.phone_number AS submitter_phone
       FROM articles a
       LEFT JOIN users u ON u.user_id = a.submitted_by_user_id
       WHERE a.article_id = $1 AND a.is_deleted = 0`,
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

exports.viewArticle = async (req, res) => {
  const conn = await pool.connect();
  try {
    await ensureArticlesTable(conn);
    await conn.query(
      'UPDATE articles SET view_count = view_count + 1 WHERE article_id = $1 AND is_deleted = 0',
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

exports.likeArticle = async (req, res) => {
  const conn = await pool.connect();
  try {
    await ensureArticlesTable(conn);
    const { phone_number } = req.body;
    if (!phone_number) return res.status(400).json({ error: 'phone_number required' });

    const { rows: uRows } = await conn.query(
      'SELECT user_id FROM users WHERE phone_number = $1', [phone_number]
    );
    const user = uRows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { rows: existingRows } = await conn.query(
      'SELECT like_id FROM article_likes WHERE article_id = $1 AND user_id = $2',
      [req.params.id, user.user_id]
    );
    const existing = existingRows[0];

    let liked;
    if (existing) {
      await conn.query(
        'DELETE FROM article_likes WHERE article_id = $1 AND user_id = $2',
        [req.params.id, user.user_id]
      );
      await conn.query(
        'UPDATE articles SET like_count = GREATEST(0, like_count - 1) WHERE article_id = $1',
        [req.params.id]
      );
      liked = false;
    } else {
      await conn.query(
        'INSERT INTO article_likes (article_id, user_id) VALUES ($1, $2)',
        [req.params.id, user.user_id]
      );
      await conn.query(
        'UPDATE articles SET like_count = like_count + 1 WHERE article_id = $1',
        [req.params.id]
      );
      liked = true;
    }

    const { rows: lcRows } = await conn.query(
      'SELECT like_count FROM articles WHERE article_id = $1', [req.params.id]
    );
    res.json({ success: true, liked, like_count: lcRows[0].like_count });
  } catch (err) {
    console.error('[Articles] likeArticle', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    conn.release();
  }
};

exports.shareArticle = async (req, res) => {
  const conn = await pool.connect();
  try {
    await ensureArticlesTable(conn);
    await conn.query(
      'UPDATE articles SET share_count = share_count + 1 WHERE article_id = $1 AND is_deleted = 0',
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

exports.getArticleComments = async (req, res) => {
  const conn = await pool.connect();
  try {
    await ensureArticlesTable(conn);
    const backendUrl = process.env.BACKEND_URL || 'http://10.0.2.2:3000';
    const { rows } = await conn.query(
      `SELECT ac.comment_id, ac.article_id, ac.user_id, ac.content, ac.created_at,
              u.full_name,
              CASE WHEN u.profile_picture IS NULL OR u.profile_picture=''
                   THEN NULL
                   ELSE $1 || '/uploads/' || u.profile_picture
              END AS profile_picture_url
       FROM article_comments ac
       JOIN users u ON u.user_id = ac.user_id
       WHERE ac.article_id = $2 AND ac.is_deleted = 0
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

exports.addArticleComment = async (req, res) => {
  const conn = await pool.connect();
  try {
    await ensureArticlesTable(conn);
    const { phone_number, content } = req.body;
    if (!content || !content.trim()) return res.status(400).json({ error: 'content required' });
    if (!phone_number) return res.status(400).json({ error: 'phone_number required' });

    const { rows: uRows } = await conn.query(
      'SELECT user_id, full_name, profile_picture FROM users WHERE phone_number = $1',
      [phone_number]
    );
    const user = uRows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { rows: ins } = await conn.query(
      'INSERT INTO article_comments (article_id, user_id, content) VALUES ($1, $2, $3) RETURNING comment_id',
      [req.params.id, user.user_id, content.trim()]
    );
    await conn.query(
      'UPDATE articles SET comment_count = comment_count + 1 WHERE article_id = $1',
      [req.params.id]
    );

    const backendUrl = process.env.BACKEND_URL || 'http://10.0.2.2:3000';
    res.status(201).json({
      comment_id: ins[0].comment_id,
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

exports.deleteArticleComment = async (req, res) => {
  const conn = await pool.connect();
  try {
    await ensureArticlesTable(conn);
    const { phone_number } = req.body;
    if (!phone_number) return res.status(400).json({ error: 'phone_number required' });

    const { rows: uRows } = await conn.query(
      'SELECT user_id FROM users WHERE phone_number = $1', [phone_number]
    );
    const user = uRows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { rows: commentRows } = await conn.query(
      'SELECT comment_id FROM article_comments WHERE comment_id = $1 AND user_id = $2 AND is_deleted = 0',
      [req.params.cid, user.user_id]
    );
    if (!commentRows[0]) return res.status(403).json({ error: 'Not allowed' });

    await conn.query(
      'UPDATE article_comments SET is_deleted = 1 WHERE comment_id = $1', [req.params.cid]
    );
    await conn.query(
      'UPDATE articles SET comment_count = GREATEST(0, comment_count - 1) WHERE article_id = $1',
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
  const conn = await pool.connect();
  try {
    await ensureArticlesTable(conn);
    const userId = Number(req.params.userId);
    if (!userId) return res.status(400).json({ error: 'Invalid user id' });

    const { rows } = await conn.query(`
      SELECT a.article_id, a.title, a.author_name, a.cover_image,
             a.summary, a.category, a.created_at,
             a.like_count, a.comment_count, a.share_count, a.view_count
      FROM articles a
      WHERE a.submitted_by_user_id = $1
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
  const conn = await pool.connect();
  try {
    await ensureArticlesTable(conn);
    const limit = Math.min(Number(req.query.limit) || 50, 100);

    const { rows } = await conn.query(`
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
      GROUP BY u.user_id, u.full_name, u.profile_picture
      HAVING (
        COALESCE(SUM(a.like_count), 0) +
        COALESCE(SUM(a.share_count), 0) +
        COALESCE(SUM(a.comment_count), 0)
      ) > 0 OR COUNT(DISTINCT a.article_id) > 0
      ORDER BY score DESC, total_likes DESC
      LIMIT $1
    `, [limit]);

    res.json({ ranking: rows });
  } catch (err) {
    console.error('[Articles] getArticleRanking', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    conn.release();
  }
};
