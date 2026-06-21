const pool = require('./config/db');

(async () => {
  const conn = await pool.getConnection();
  try {
    // First check if users exist
    const usersCheck = await conn.query('SELECT user_id FROM users LIMIT 5');
    console.log('Sample users:', usersCheck);

    // Check posts.user_id values
    const postsUserIds = await conn.query('SELECT DISTINCT user_id FROM posts LIMIT 5');
    console.log('Sample post user_ids:', postsUserIds);

    // Check if there's a mismatch
    const result = await conn.query(`
      SELECT 
        p.post_id, 
        p.user_id,
        u.user_id as u_user_id,
        p.content,
        u.full_name
      FROM posts p
      LEFT JOIN users u ON u.user_id = p.user_id
      WHERE p.is_deleted = 0
      LIMIT 5
    `);
    console.log('Join test result:', result);

    // Now try the full query
    const trending = await conn.query(`
      SELECT 
        p.post_id, 
        p.content, 
        p.created_at, 
        p.group_id, 
        u.full_name, 
        u.phone_number,
        g.group_name,
        (SELECT COUNT(*) FROM post_likes pl WHERE pl.post_id = p.post_id AND pl.type='like') AS likes,
        (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.post_id) AS comments
      FROM posts p
      JOIN users u ON u.user_id = p.user_id
      LEFT JOIN groups g ON g.group_id = p.group_id
      WHERE p.is_deleted = 0
      ORDER BY likes DESC, comments DESC, p.created_at DESC
      LIMIT 8
    `);
    console.log('Trending query result count:', trending.length);
    console.log('First trending:', trending[0]);
  } catch(err) {
    console.error('Error:', err);
  } finally {
    conn.release();
    process.exit(0);
  }
})();
