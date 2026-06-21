require('dotenv').config();
const pool = require('./config/db');

async function fix() {
  const conn = await pool.getConnection();
  try {
    // Show current state
    const [rewards] = await conn.query(
      `SELECT reward_id, reward_name, partner_id FROM rewards WHERE is_deleted = 0 ORDER BY reward_id`
    );
    const [partners] = await conn.query(`SELECT id, name FROM partners ORDER BY id`);

    console.log('\n=== Partners ===');
    partners.forEach(p => console.log(`  id=${p.id}  name="${p.name}"`));

    console.log('\n=== Rewards (before fix) ===');
    rewards.forEach(r => console.log(`  id=${r.reward_id}  partner_id=${r.partner_id}  name="${r.reward_name}"`));

    // Link "โรงพยาบาลกรุงเทพ" to Lotus's (id=2)
    const [res] = await conn.query(
      `UPDATE rewards SET partner_id = 2 WHERE reward_name LIKE '%โรงพยาบาลกรุงเทพ%' AND is_deleted = 0`
    );
    console.log(`\n✅ Updated ${res.affectedRows} row(s) → linked to Lotus's (id=2)`);

    // Verify
    const [after] = await conn.query(
      `SELECT reward_id, reward_name, partner_id FROM rewards WHERE is_deleted = 0 ORDER BY reward_id`
    );
    console.log('\n=== Rewards (after fix) ===');
    after.forEach(r => console.log(`  id=${r.reward_id}  partner_id=${r.partner_id}  name="${r.reward_name}"`));

  } finally {
    conn.release();
    process.exit(0);
  }
}

fix().catch(e => { console.error(e); process.exit(1); });
