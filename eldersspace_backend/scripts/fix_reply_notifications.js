const pool = require('../config/db');

(async () => {
  let conn;
  try {
    conn = await pool.getConnection();

    console.log('Fixing notification types for replies...');

    // Update notifications ที่เป็น reply ให้ type = 'reply'
    // โดยตรวจจากการมี parent_id ใน comments
    const result = await conn.query(`
      UPDATE notifications n
      SET n.type = 'reply'
      WHERE n.type = 'comment' 
        AND EXISTS (
          SELECT 1 FROM comments c
          WHERE c.post_id = n.post_id 
            AND c.user_id = n.actor_id
            AND c.parent_id IS NOT NULL
          LIMIT 1
        )
    `);

    console.log(`✅ Fixed ${result.affectedRows} notifications`);
    conn.release();
    process.exit(0);

  } catch (err) {
    console.error('❌ Error:', err.message);
    if (conn) conn.release();
    process.exit(1);
  }
})();
