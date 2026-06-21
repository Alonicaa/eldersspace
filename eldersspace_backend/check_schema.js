const pool = require('./config/db');

(async () => {
  try {
    const conn = await pool.getConnection();
    const result = await conn.query('DESCRIBE users');
    console.log('\n========== USERS TABLE SCHEMA ==========\n');
    console.table(result);
    
    // ดึงข้อมูล 1 record เพื่อดู sample data
    const sample = await conn.query('SELECT * FROM users LIMIT 1');
    console.log('\n========== SAMPLE USER DATA ==========\n');
    if (sample.length > 0) {
      console.log(JSON.stringify(sample[0], null, 2));
    }
    
    conn.release();
  } catch (err) {
    console.error('Error:', err.message);
  }
  process.exit(0);
})();
