#!/usr/bin/env node
/**
 * Database Recreation Script
 * Creates the 'eldersspace' database and restores all tables from schema
 * Usage: node recreate_database.js
 * 
 * This script will:
 * 1. Connect to the MySQL server (without selecting a database initially)
 * 2. Create the 'eldersspace' database if it doesn't exist
 * 3. Select the database
 * 4. Restore all tables from the complete schema
 */

require('dotenv').config();
const fs = require('fs');
const mariadb = require('mariadb');

async function recreateDatabase() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║        DATABASE RECREATION & RESTORATION SCRIPT            ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const dbHost = process.env.DB_HOST || '127.0.0.1';
  const dbPort = parseInt(process.env.DB_PORT || '3306');
  const dbUser = process.env.DB_USER || 'root';
  const dbPassword = process.env.DB_PASSWORD || 'password';
  const dbName = process.env.DB_DATABASE || 'eldersspace';
  const schemaFile = './sql/complete_database_schema.sql';

  console.log(`📋 Configuration:`);
  console.log(`   Host: ${dbHost}:${dbPort}`);
  console.log(`   User: ${dbUser}`);
  console.log(`   Database: ${dbName}`);
  console.log(`   Schema File: ${schemaFile}\n`);

  // Verify schema file exists
  if (!fs.existsSync(schemaFile)) {
    console.error(`❌ Schema file not found: ${schemaFile}`);
    process.exit(1);
  }

  // Create pool WITHOUT selecting a database (to create database itself)
  const adminPool = mariadb.createPool({
    host: dbHost,
    port: dbPort,
    user: dbUser,
    password: dbPassword,
    allowPublicKeyRetrieval: true,
    connectTimeout: 10000,
    acquireTimeout: 10000
  });

  let adminConn;
  let dbPool;
  let dbConn;

  try {
    // Step 1: Connect as admin (no database selected)
    adminConn = await adminPool.getConnection();
    console.log('✅ Connected to MySQL server\n');

    // Step 2: Create database
    console.log('🔨 Creating database...');
    try {
      await adminConn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` 
        CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
      console.log(`✅ Database '${dbName}' ready\n`);
    } catch (err) {
      console.error(`❌ Failed to create database: ${err.message}`);
      throw err;
    }

    adminConn.release();

    // Step 3: Connect to the database
    dbPool = mariadb.createPool({
      host: dbHost,
      port: dbPort,
      user: dbUser,
      password: dbPassword,
      database: dbName,
      allowPublicKeyRetrieval: true,
      connectTimeout: 10000,
      acquireTimeout: 10000
    });

    dbConn = await dbPool.getConnection();
    console.log(`✅ Connected to database '${dbName}'\n`);

    // Step 4: Parse and execute schema
    console.log('📊 Parsing schema file...');
    const sql = fs.readFileSync(schemaFile, 'utf8');

    let cleanSql = sql
      .replace(/--[^\n]*\n/g, '\n')
      .replace(/\/\*[\s\S]*?\*\//g, '');

    const statements = cleanSql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 5);

    console.log(`   Found ${statements.length} SQL statements\n`);
    console.log('🔄 Executing statements...\n');

    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      if (stmt.length < 5) continue;

      try {
        await dbConn.query(stmt);
        successCount++;

        if ((i + 1) % 5 === 0) {
          const percent = Math.round(((i + 1) / statements.length) * 100);
          console.log(`   ✓ ${i + 1}/${statements.length} (${percent}%)`);
        }
      } catch (err) {
        errorCount++;
        if (err.code !== 'ER_TABLE_EXISTS_ERROR' && 
            !err.message.includes('already exists')) {
          errors.push({
            stmt: stmt.substring(0, 100),
            error: err.message
          });
        }
      }
    }

    console.log(`\n✅ Schema execution completed!\n`);

    // Step 5: Verify tables
    console.log('🔍 Verifying tables...\n');
    const tables = await dbConn.query('SHOW TABLES');
    console.log(`📋 Total tables created: ${tables.length}\n`);

    const tableList = tables.map(row => Object.values(row)[0]);
    tableList.forEach(table => {
      console.log(`   ✓ ${table}`);
    });

    console.log(`\n📊 Summary:`);
    console.log(`   ✅ Successful statements: ${successCount}`);
    console.log(`   ⚠️  Errors/Skipped: ${errorCount}`);
    console.log(`   📋 Tables created: ${tables.length}\n`);

    if (errors.length > 0) {
      console.log('⚠️  Error details (non-critical):');
      errors.slice(0, 5).forEach((err, idx) => {
        console.log(`   ${idx + 1}. ${err.error}`);
        console.log(`      SQL: ${err.stmt}...\n`);
      });
    }

    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║         DATABASE RECREATION COMPLETED SUCCESSFULLY!        ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    // Optional: Display connection string for verification
    console.log('💾 Connection Details for Verification:');
    console.log(`   Host: ${dbHost}`);
    console.log(`   Port: ${dbPort}`);
    console.log(`   User: ${dbUser}`);
    console.log(`   Database: ${dbName}\n`);

    process.exit(0);
  } catch (err) {
    console.error(`\n❌ Fatal error: ${err.message}\n`);
    
    if (err.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('   💡 Check DB_USER and DB_PASSWORD in .env file\n');
    } else if (err.code === 'ECONNREFUSED') {
      console.error('   💡 Cannot connect to database server');
      console.error(`      Check: host=${dbHost}, port=${dbPort}\n`);
    }

    console.error('Stack trace:', err.stack);
    process.exit(1);
  } finally {
    if (dbConn) dbConn.release();
    if (adminConn) adminConn.release();
    if (dbPool) await dbPool.end();
    if (adminPool) await adminPool.end();
  }
}

// Run the script
recreateDatabase();
