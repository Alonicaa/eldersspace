const pool = require('../config/db');

async function addRewardColumns() {
  const conn = await pool.getConnection();
  
  try {
    console.log('Adding columns to rewards table...');
    
    const columnsToAdd = [
      {
        name: 'stock',
        ddl: "ADD COLUMN stock INT DEFAULT 0 AFTER is_active"
      },
      {
        name: 'redemption_count',
        ddl: "ADD COLUMN redemption_count INT DEFAULT 0 AFTER stock"
      },
      {
        name: 'user_limit',
        ddl: "ADD COLUMN user_limit INT DEFAULT -1 AFTER redemption_count"
      }
    ];
    
    for (const col of columnsToAdd) {
      try {
        const check = await conn.query(
          `SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS 
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rewards' AND COLUMN_NAME = ?`,
          [col.name]
        );
        
        if (check[0].cnt === 0) {
          await conn.query(`ALTER TABLE rewards ${col.ddl}`);
          console.log(`✅ Added column: ${col.name}`);
        } else {
          console.log(`⚠️  Column already exists: ${col.name}`);
        }
      } catch (err) {
        console.error(`❌ Error adding column ${col.name}:`, err.message);
      }
    }
    
    conn.release();
    console.log('\n✅ Reward table columns added successfully!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    conn.release();
    process.exit(1);
  }
}

addRewardColumns();
