#!/usr/bin/env node
/**
 * Database Schema Restoration Script
 * Restores all tables from complete_database_schema.sql
 * Usage: node restore_database.js
 */

require('dotenv').config();
const fs = require('fs');
const mariadb = require('mariadb');

async function restoreDatabase() {
  const schemaFile = './sql/complete_database_schema.sql';
  
  if (!fs.existsSync(schemaFile)) {
    console.error(`❌ Schema file not found: ${schemaFile}`);
    process.exit(1);
  }

  const sql = fs.readFileSync(schemaFile, 'utf8');
  
  // Remove comments but preserve structure
  let cleanSql = sql
    .replace(/--[^\n]*\n/g, '\n')  // Remove -- comments
    .replace(/\/\*[\s\S]*?\*\//g, ''); // Remove /* */ comments
  
  const statements = cleanSql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 5); // Only keep non-empty statements

  console.log(`\n📊 Starting database restoration...`);
  console.log(`📁 Schema file: ${schemaFile}`);
  console.log(`🔢 SQL statements to execute: ${statements.length}\n`);

  const pool = mariadb.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'password',
    database: process.env.DB_DATABASE || 'eldersspace',
    allowPublicKeyRetrieval: true,
    connectTimeout: 10000,
    acquireTimeout: 10000
  });

  let conn;
  try {
    conn = await pool.getConnection();
    console.log('✅ Connected to database\n');

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      if (stmt.length < 5) continue;

      try {
        await conn.query(stmt);
        successCount++;
        
        if ((i + 1) % 5 === 0) {
          console.log(`  ✓ Applied ${i + 1}/${statements.length}`);
        }
      } catch (err) {
        errorCount++;
        if (err.code !== 'ER_TABLE_EXISTS_ERROR') {
          console.error(`  ⚠️  Statement ${i + 1} error: ${err.message}`);
          console.error(`     SQL: ${stmt.substring(0, 80)}...`);
        }
      }
    }

    console.log(`\n✅ Database restoration completed!`);
    console.log(`📊 Results: ${successCount} successful, ${errorCount} errors/skipped\n`);

    // Verify tables
    const tables = await conn.query('SHOW TABLES');
    console.log(`📋 Tables created: ${tables.length}`);
    tables.forEach(row => {
      const tableName = Object.values(row)[0];
      console.log(`   ✓ ${tableName}`);
    });

    process.exit(0);
  } catch (err) {
    console.error(`\n❌ Fatal error: ${err.message}`);
    if (err.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('   Check DB_USER and DB_PASSWORD in .env');
    } else if (err.code === 'ER_BAD_DB_ERROR') {
      console.error('   Database does not exist. Create it first with:');
      console.error('   CREATE DATABASE eldersspace CHARACTER SET utf8mb4;');
    }
    process.exit(1);
  } finally {
    if (conn) conn.release();
    await pool.end();
  }
}

restoreDatabase();
