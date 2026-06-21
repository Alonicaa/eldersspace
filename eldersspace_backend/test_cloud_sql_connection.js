#!/usr/bin/env node
/**
 * Cloud SQL Connection Test Script
 * Tests whether the backend can connect to Google Cloud SQL
 * 
 * Usage:
 *   node test_cloud_sql_connection.js
 */

require('dotenv').config();
const mysql = require('mysql2/promise');

async function testConnection() {
  console.log('\n🧪 Testing Cloud SQL Connection...\n');

  // Display configuration
  console.log('📋 Configuration:');
  console.log(`   Host: ${process.env.DB_HOST}`);
  console.log(`   Port: ${process.env.DB_PORT || 3306}`);
  console.log(`   User: ${process.env.DB_USER}`);
  console.log(`   Database: ${process.env.DB_DATABASE}`);
  console.log(`   SSL Enabled: ${process.env.DB_SSL_CA ? 'Yes' : 'No'}`);
  console.log();

  try {
    console.log('🔌 Attempting connection...');
    
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_DATABASE,
      ssl: { rejectUnauthorized: false },
      connectTimeout: 10000
    });

    console.log('✅ Connection successful!\n');

    // Test basic query
    console.log('🔍 Testing query execution...');
    const [rows] = await connection.execute('SELECT 1 as result');
    console.log('✅ Query executed successfully\n');

    // Get database info
    const [info] = await connection.execute('SELECT VERSION() as version, DATABASE() as current_db');
    console.log('📊 Server Info:');
    console.log(`   MySQL Version: ${info[0].version}`);
    console.log(`   Current Database: ${info[0].current_db}`);
    console.log();

    // Count tables
    const [tables] = await connection.execute(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ?`,
      [process.env.DB_DATABASE]
    );
    console.log(`📚 Tables in database: ${tables.length}`);
    if (tables.length > 0) {
      console.log('   Tables:');
      tables.forEach(t => console.log(`     - ${t.TABLE_NAME}`));
    }
    console.log();

    await connection.end();

    console.log('🎉 All tests passed! Cloud SQL is properly configured.\n');
    process.exit(0);

  } catch (error) {
    console.error('❌ Connection failed!\n');
    console.error('Error Details:');
    console.error(`   Code: ${error.code}`);
    console.error(`   Message: ${error.message}`);
    console.error();

    // Provide troubleshooting hints
    console.error('💡 Troubleshooting hints:');
    if (error.code === 'ECONNREFUSED') {
      console.error('   - Cloud SQL instance may not be running');
      console.error('   - Check if host/port are correct');
      console.error('   - Verify firewall rules');
    } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('   - Invalid username or password');
      console.error('   - User may not have permission to access this database');
    } else if (error.code === 'ENOTFOUND') {
      console.error('   - Host name is incorrect or DNS resolution failed');
      console.error('   - Check your network connectivity');
    }
    console.error();

    process.exit(1);
  }
}

testConnection();
