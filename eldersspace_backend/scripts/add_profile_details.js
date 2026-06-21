const pool = require('../config/db.js');

async function addProfileDetailsColumns() {
  const conn = await pool.getConnection();
  try {
    console.log('Adding profile details columns to users table...');
    
    // Alter table to add new columns for profile details
    await conn.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS current_location VARCHAR(255);
    `);
    console.log('✓ Added current_location');

    await conn.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS hometown VARCHAR(255);
    `);
    console.log('✓ Added hometown');

    await conn.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS birth_date DATE;
    `);
    console.log('✓ Added birth_date');

    await conn.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS relationship_status VARCHAR(50);
    `);
    console.log('✓ Added relationship_status');

    await conn.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS family_info VARCHAR(255);
    `);
    console.log('✓ Added family_info');

    await conn.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS gender VARCHAR(50);
    `);
    console.log('✓ Added gender');

    await conn.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS pronouns VARCHAR(50);
    `);
    console.log('✓ Added pronouns');

    console.log('✓ All profile detail columns added successfully!');
  } catch (err) {
    if (err.message.includes('Duplicate column')) {
      console.log('✓ Columns already exist');
    } else {
      throw err;
    }
  } finally {
    conn.release();
  }
}

addProfileDetailsColumns().catch(console.error);
