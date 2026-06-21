require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

// Determine if using Cloud SQL
const isCloudSQL = process.env.USE_CLOUD_SQL_PROXY === 'true' || process.env.CLOUD_SQL_CONNECTION_NAME;

let sslConfig = {
  rejectUnauthorized: false,
  minVersion: 'TLSv1.2'
};

// Load SSL certificates if they exist (for direct Cloud SQL connection)
if (isCloudSQL && process.env.DB_SSL_CA) {
  try {
    sslConfig = {
      ca: fs.readFileSync(path.resolve(process.env.DB_SSL_CA)),
      rejectUnauthorized: true
    };
  } catch (error) {
    console.warn('Warning: Could not load SSL certificates. Using insecure connection.');
  }
}

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,

  waitForConnections: true,
  connectionLimit: process.env.DB_CONNECTION_LIMIT || 5,
  queueLimit: 0,

  ssl: sslConfig,

  authPlugins: {
    mysql_clear_password: () => () => Buffer.from(process.env.DB_PASSWORD + '\0')
  },

  enableKeepAlive: true,
  keepAliveInitialDelayMs: 30000,

  allowPublicKeyRetrieval: true
});

// Test connection on startup
pool.getConnection()
  .then(conn => {
    console.log('✅ Database connection successful');
    conn.release();
  })
  .catch(err => {
    console.error('❌ Database connection failed:', err.message);
  });

module.exports = pool;