const pool = require('../config/db.js');

async function addCommentReplySoftDeleteColumns() {
  const conn = await pool.getConnection();

  try {
    console.log('Updating comments table for reply/edit/soft-delete support...');

    await conn.query(`
      ALTER TABLE comments
      ADD COLUMN IF NOT EXISTS parent_id INT(11) NULL AFTER user_id;
    `);
    console.log('Added parent_id');

    await conn.query(`
      ALTER TABLE comments
      ADD COLUMN IF NOT EXISTS is_deleted TINYINT(1) NOT NULL DEFAULT 0 AFTER content;
    `);
    console.log('Added is_deleted');

    await conn.query(`
      ALTER TABLE comments
      ADD COLUMN IF NOT EXISTS deleted_at DATETIME NULL AFTER created_at;
    `);
    console.log('Added deleted_at');

    await conn.query(`
      ALTER TABLE comments
      ADD COLUMN IF NOT EXISTS updated_at DATETIME NULL AFTER deleted_at;
    `);
    console.log('Added updated_at');

    await conn.query(`
      CREATE INDEX IF NOT EXISTS idx_comments_post_parent ON comments(post_id, parent_id);
    `);
    console.log('Created idx_comments_post_parent');

    await conn.query(`
      CREATE INDEX IF NOT EXISTS idx_comments_is_deleted ON comments(is_deleted);
    `);
    console.log('Created idx_comments_is_deleted');

    await conn.query(`
      ALTER TABLE comments
      ADD CONSTRAINT fk_comments_parent
      FOREIGN KEY (parent_id)
      REFERENCES comments(comment_id)
      ON DELETE SET NULL;
    `).catch((err) => {
      if (!String(err.message || '').includes('Duplicate key') &&
          !String(err.message || '').includes('already exists')) {
        throw err;
      }
      console.log('fk_comments_parent already exists');
    });

    console.log('Comments table migration completed successfully.');
  } finally {
    conn.release();
  }
}

addCommentReplySoftDeleteColumns().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
