require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  ssl: { rejectUnauthorized: false },
  max: process.env.DB_CONNECTION_LIMIT || 5,
  family: 4,
});

pool.connect()
  .then(client => { console.log('✅ Database connection successful'); client.release(); })
  .catch(err => console.error('❌ Database connection failed:', err.message));

module.exports = pool;
