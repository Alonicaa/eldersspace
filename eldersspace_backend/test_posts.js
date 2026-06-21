const pool = require('./config/db.js');

(async () => {
  let conn;
  try {
    conn = await pool.getConnection();
    
    // Test the FIXED trending query
    console.log('Testing fixed trending posts query...\n');
    
    const query = `SELECT p.post_id, p.content, p.created_at, p.group_id, u.full_name, u.phone_number,
              g.name AS group_name,
              (SELECT COUNT(*) FROM post_likes pl WHERE pl.post_id = p.post_id AND pl.type='like') AS likes,
              (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.post_id) AS comments
       FROM posts p
       JOIN users u ON u.user_id = p.user_id
       LEFT JOIN groups g ON g.group_id = p.group_id
       WHERE p.is_deleted = 0
       ORDER BY (SELECT COUNT(*) FROM post_likes pl WHERE pl.post_id = p.post_id AND pl.type='like') DESC,
                (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.post_id) DESC,
                p.created_at DESC
       LIMIT 8`;
    
    const results = await conn.query(query);
    console.log('✅ Trending posts found:', results.length);
    results.forEach((r, i) => {
      console.log(`\n${i+1}. Post ${r.post_id}: "${r.content?.substring(0, 40)}"`);
      console.log(`   Author: ${r.full_name}`);
      console.log(`   Group: ${r.group_name || 'ทั่วไป'}`);
      console.log(`   👍 ${r.likes} likes | 💬 ${r.comments} comments`);
    });
    
    conn.release();
  } catch(e) {
    console.error('❌ Error:', e.message);
  }
  process.exit(0);
})();
