require('dotenv').config();
const pool = require('../config/db');

async function addCampaignDatesToRewards() {
  let conn;
  try {
    conn = await pool.getConnection();

    // Add campaign_start_date column
    try {
      await conn.query(`ALTER TABLE rewards ADD COLUMN campaign_start_date DATETIME DEFAULT NULL`);
      console.log('✅ Added campaign_start_date to rewards table');
    } catch (e) {
      if (e.code === 'ER_DUP_FIELDNAME') {
        console.log('ℹ️  campaign_start_date already exists, skipping');
      } else throw e;
    }

    // Add campaign_end_date column
    try {
      await conn.query(`ALTER TABLE rewards ADD COLUMN campaign_end_date DATETIME DEFAULT NULL`);
      console.log('✅ Added campaign_end_date to rewards table');
    } catch (e) {
      if (e.code === 'ER_DUP_FIELDNAME') {
        console.log('ℹ️  campaign_end_date already exists, skipping');
      } else throw e;
    }

    // Add indexes for date range queries
    try {
      await conn.query(`ALTER TABLE rewards ADD KEY idx_campaign_dates (campaign_start_date, campaign_end_date)`);
      console.log('✅ Added index for campaign dates');
    } catch (e) {
      if (e.code === 'ER_DUP_KEYNAME') {
        console.log('ℹ️  Index already exists, skipping');
      } else throw e;
    }

    conn.release();
    console.log('\n✅ Migration completed successfully');
  } catch (error) {
    console.error('❌ Migration error:', error);
    if (conn) conn.release();
    process.exit(1);
  }
}

addCampaignDatesToRewards().then(() => {
  console.log('Migration script finished');
  process.exit(0);
});
