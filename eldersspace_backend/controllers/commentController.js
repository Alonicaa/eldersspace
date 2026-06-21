const pool = require('../config/db');
const { assertUserCanInteract } = require('../services/moderationService');

async function ensureCommentReportsTable(conn) {
  await conn.query(
    `CREATE TABLE IF NOT EXISTS comment_reports (
      report_id INT AUTO_INCREMENT PRIMARY KEY,
      comment_id INT NOT NULL,
      reporter_user_id INT NOT NULL,
      reason VARCHAR(100) NULL,
      detail TEXT NULL,
      status ENUM('pending','reviewed','dismissed') NOT NULL DEFAULT 'pending',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_comment_reporter (comment_id, reporter_user_id),
      INDEX idx_comment_reports_comment_id (comment_id),
      INDEX idx_comment_reports_status_created (status, created_at),
      CONSTRAINT fk_comment_reports_comment FOREIGN KEY (comment_id) REFERENCES comments(comment_id) ON DELETE CASCADE,
      CONSTRAINT fk_comment_reports_reporter FOREIGN KEY (reporter_user_id) REFERENCES users(user_id) ON DELETE CASCADE
    )`
  );
}

exports.getComments = async (req,res)=>{

 const {postId} = req.params;
 let conn;

 try {
   conn = await pool.getConnection();

   const backendUrl = process.env.BACKEND_URL || 'http://10.0.2.2:3000';
   const [comments] = await conn.query(
`SELECT
 c.comment_id,
 c.post_id,
 c.user_id,
 c.parent_id,
 c.content,
 c.is_deleted,
 c.deleted_at,
 c.created_at,
 c.updated_at,
 u.full_name,
 u.phone_number as user_phone,
 CASE
   WHEN u.profile_picture IS NULL OR u.profile_picture='' THEN NULL
   ELSE CONCAT(?,'/uploads/',u.profile_picture)
 END as profile_picture_url
FROM comments c
JOIN users u ON c.user_id=u.user_id
WHERE c.post_id=?
  AND c.is_deleted=0
ORDER BY c.created_at ASC`,
[backendUrl, postId]
   );

   res.json(comments);
 } catch (err) {
   console.error(err);
   res.status(500).json({ error: err.message });
 } finally {
   if (conn) conn.release();
 }

};



exports.addComment = async (req,res)=>{

 const {postId} = req.params;
 const {phone,content,parent_id} = req.body;
 let conn;

 if (!content || !content.trim()) {
  return res.status(400).json({ error: 'Content is required' });
 }

 try {
  conn = await pool.getConnection();

  const guard = await assertUserCanInteract(conn, phone);
  if (!guard.allowed) {
   return res.status(guard.statusCode).json(guard.payload);
  }

  const [user] = await conn.query(
   "SELECT user_id FROM users WHERE phone_number=?",
   [phone]
  );

  if (!user.length) {
   return res.status(404).json({ error: 'User not found' });
  }

  const actorId = Number(user[0].user_id);
  let parentId = null;

  if (parent_id !== undefined && parent_id !== null && `${parent_id}` !== '') {
   parentId = Number(parent_id);
   if (!Number.isInteger(parentId) || parentId <= 0) {
   return res.status(400).json({ error: 'Invalid parent_id' });
   }

   const [parentComment] = await conn.query(
   `SELECT comment_id,post_id,is_deleted,user_id
    FROM comments
    WHERE comment_id=?`,
   [parentId]
   );

   if (!parentComment.length) {
   return res.status(404).json({ error: 'Parent comment not found' });
   }

   if (Number(parentComment[0].post_id) !== Number(postId)) {
   return res.status(400).json({ error: 'Parent comment does not belong to this post' });
   }

   if (Number(parentComment[0].is_deleted) === 1) {
   return res.status(400).json({ error: 'Cannot reply to deleted comment' });
   }
  }

  const [insertRes] = await conn.query(
   `INSERT INTO comments(post_id,user_id,content,parent_id)
   VALUES(?,?,?,?)`,
   [postId,actorId,content.trim(),parentId]
  );

  const [post] = await conn.query(
   "SELECT user_id FROM posts WHERE post_id=?",
   [postId]
  );

  const targets = new Set();

  if (post.length) {
   targets.add(Number(post[0].user_id));
  }

  if (parentId) {
   const [parentComment] = await conn.query(
   "SELECT user_id FROM comments WHERE comment_id=?",
   [parentId]
   );
   if (parentComment.length) {
   targets.add(Number(parentComment[0].user_id));
   }
  }

  for (const targetUserId of targets) {
   if (targetUserId === actorId) continue;
   const notificationType = parentId ? 'reply' : 'comment';
   await conn.query(
   `INSERT INTO notifications(user_id,actor_id,post_id,type)
    VALUES(?,?,?,?)`,
   [targetUserId,actorId,postId,notificationType]
   );
  }

  res.json({
   message:"comment added",
   comment_id: Number(insertRes.insertId),
  });
 } catch (err) {
  console.error(err);
  res.status(500).json({ error: err.message });
 } finally {
  if (conn) conn.release();
 }
};

exports.updateComment = async (req, res) => {
 const { commentId } = req.params;
 const { phone, content } = req.body;
 let conn;

 if (!content || !content.trim()) {
  return res.status(400).json({ error: 'Content is required' });
 }

 try {
  conn = await pool.getConnection();

  const [user] = await conn.query(
   'SELECT user_id FROM users WHERE phone_number=?',
   [phone]
  );

  if (!user.length) {
   return res.status(404).json({ error: 'User not found' });
  }

  const actorId = Number(user[0].user_id);
  const [comments] = await conn.query(
   'SELECT comment_id,user_id,is_deleted FROM comments WHERE comment_id=?',
   [commentId]
  );

  if (!comments.length) {
   return res.status(404).json({ error: 'Comment not found' });
  }

  const comment = comments[0];

  if (Number(comment.user_id) !== actorId) {
   return res.status(403).json({ error: 'Cannot edit this comment' });
  }

  if (Number(comment.is_deleted) === 1) {
   return res.status(400).json({ error: 'Cannot edit deleted comment' });
  }

  await conn.query(
   `UPDATE comments
   SET content=?, updated_at=NOW()
   WHERE comment_id=?`,
   [content.trim(),commentId]
  );

  res.json({ message: 'Comment updated' });
 } catch (err) {
  console.error(err);
  res.status(500).json({ error: err.message });
 } finally {
  if (conn) conn.release();
 }
};

exports.deleteComment = async (req, res) => {
 const { commentId } = req.params;
 const { phone } = req.body;
 let conn;

 try {
  conn = await pool.getConnection();

  const [user] = await conn.query(
   'SELECT user_id FROM users WHERE phone_number=?',
   [phone]
  );

  if (!user.length) {
   return res.status(404).json({ error: 'User not found' });
  }

  const actorId = Number(user[0].user_id);
  const [comments] = await conn.query(
   'SELECT comment_id,user_id,is_deleted FROM comments WHERE comment_id=?',
   [commentId]
  );

  if (!comments.length) {
   return res.status(404).json({ error: 'Comment not found' });
  }

  const comment = comments[0];

  if (Number(comment.user_id) !== actorId) {
   return res.status(403).json({ error: 'Cannot delete this comment' });
  }

  if (Number(comment.is_deleted) === 1) {
   return res.status(400).json({ error: 'Comment already deleted' });
  }

  await conn.query(
   `UPDATE comments
    SET is_deleted=1,
      deleted_at=NOW(),
      updated_at=NOW()
   WHERE comment_id=?`,
   [commentId]
  );

  res.json({ message: 'Comment deleted' });
 } catch (err) {
  console.error(err);
  res.status(500).json({ error: err.message });
 } finally {
  if (conn) conn.release();
 }
};

exports.reportComment = async (req, res) => {
 const { commentId } = req.params;
 const { phone, reason, detail } = req.body;
 let conn;

 try {
  conn = await pool.getConnection();

  await ensureCommentReportsTable(conn);

  const [user] = await conn.query(
   'SELECT user_id FROM users WHERE phone_number=?',
   [phone]
  );

  if (!user.length) {
   return res.status(404).json({ error: 'User not found' });
  }

  const reporterUserId = Number(user[0].user_id);

  const [comments] = await conn.query(
   'SELECT comment_id FROM comments WHERE comment_id=?',
   [commentId]
  );

  if (!comments.length) {
   return res.status(404).json({ error: 'Comment not found' });
  }

  try {
   await conn.query(
    `INSERT INTO comment_reports (comment_id, reporter_user_id, reason, detail)
     VALUES (?, ?, ?, ?)`,
    [commentId, reporterUserId, reason || null, detail || null]
   );
  } catch (dbErr) {
   // Handle unique constraint violation (user already reported this comment)
   if (dbErr.code === 'ER_DUP_ENTRY') {
    return res.status(400).json({ error: 'You have already reported this comment' });
   }
   throw dbErr;
  }

  res.json({ message: 'Comment reported successfully' });
 } catch (err) {
  console.error(err);
  res.status(500).json({ error: err.message });
 } finally {
  if (conn) conn.release();
 }
};
