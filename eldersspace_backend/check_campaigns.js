require('dotenv').config();
const pool = require('./config/db');

async function check() {
  const conn = await pool.getConnection();
  try {
    // 1. Show columns of rewards table
    const [cols] = await conn.query(`
      SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
      FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = 'rewards'
      ORDER BY ORDINAL_POSITION
    `);
    console.log('\n=== rewards columns ===');
    cols.forEach(c => console.log(`  ${c.COLUMN_NAME} (${c.DATA_TYPE}, nullable=${c.IS_NULLABLE}, default=${c.COLUMN_DEFAULT})`));

    // 2. Show all rewards with their partner_id
    const [rewards] = await conn.query(`
      SELECT reward_id, reward_name, partner_id, created_at
      FROM rewards
      WHERE is_deleted = 0
      ORDER BY reward_id
    `);
    console.log('\n=== rewards (partner_id per row) ===');
    rewards.forEach(r => console.log(`  id=${r.reward_id}  partner_id=${r.partner_id}  name="${r.reward_name}"`));

    // 3. Show partners
    const [partners] = await conn.query(`SELECT id, name FROM partners ORDER BY id`);
    console.log('\n=== partners ===');
    partners.forEach(p => console.log(`  id=${p.id}  name="${p.name}"`));

    // 4. Test filter for each partner
    for (const p of partners) {
      const [filtered] = await conn.query(
        `SELECT reward_id, reward_name FROM rewards WHERE is_deleted = 0 AND partner_id = ?`,
        [p.id]
      );
      console.log(`\n  Filter partner_id=${p.id} (${p.name}) → ${filtered.length} campaigns`);
      filtered.forEach(r => console.log(`    - ${r.reward_name}`));
    }

  } finally {
    conn.release();
    process.exit(0);
  }
}

check().catch(e => { console.error(e); process.exit(1); });
