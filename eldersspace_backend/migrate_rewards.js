const pool = require('./config/db');

(async () => {
  try {
    const conn = await pool.getConnection();

    const existingColumns = await conn.query(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rewards'"
    );
    const existing = new Set(existingColumns.map((row) => row.COLUMN_NAME));

    const commands = [
      {
        column: 'description',
        sql: 'ALTER TABLE rewards ADD COLUMN description LONGTEXT'
      },
      {
        column: 'image_url',
        sql: 'ALTER TABLE rewards ADD COLUMN image_url VARCHAR(500)'
      },
      {
        column: 'category',
        sql: 'ALTER TABLE rewards ADD COLUMN category VARCHAR(100)'
      },
      {
        column: 'is_active',
        sql: 'ALTER TABLE rewards ADD COLUMN is_active TINYINT(1) DEFAULT 1'
      },
      {
        column: 'created_at',
        sql: 'ALTER TABLE rewards ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
      },
      {
        column: 'updated_at',
        sql: 'ALTER TABLE rewards ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'
      },
      {
        column: 'campaign_start_date',
        sql: "ALTER TABLE rewards ADD COLUMN campaign_start_date DATE DEFAULT NULL COMMENT 'วันที่เริ่มแคมเปญ'"
      },
      {
        column: 'campaign_end_date',
        sql: "ALTER TABLE rewards ADD COLUMN campaign_end_date DATE DEFAULT NULL COMMENT 'วันที่สิ้นสุดแคมเปญ'"
      },
      {
        column: 'usage_instructions',
        sql: "ALTER TABLE rewards ADD COLUMN usage_instructions TEXT DEFAULT NULL COMMENT 'วิธีใช้รหัสหรือเงื่อนไขการใช้งาน'"
      },
      {
        column: 'validity_hours',
        sql: "ALTER TABLE rewards ADD COLUMN validity_hours INT DEFAULT 1 COMMENT 'ระยะเวลาที่รหัสมีอายุการใช้งาน (หน่วย: ชั่วโมง)'"
      }
    ];

    for (const command of commands) {
      if (existing.has(command.column)) {
        console.log('•', command.column, 'already exists');
        continue;
      }

      await conn.query(command.sql);
      console.log('✓', command.sql);
    }
    
    console.log('\n✅ Migration complete!');
    
    // Verify structure
    const result = await conn.query('DESCRIBE rewards');
    console.log('\nUpdated schema:');
    console.table(result);
    
    conn.release();
  } catch (err) {
    console.error('Error:', err.message);
  }
  process.exit(0);
})();
