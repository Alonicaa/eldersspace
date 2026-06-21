/**
 * Database Connection Check Script
 * ตรวจสอบการเชื่อมต่อ Cloud SQL
 */

require('dotenv').config();
const pool = require('./config/db');

async function checkDatabaseConnection() {
    console.log('\n========== DATABASE CONNECTION CHECK ==========\n');
    console.log('Environment Variables:');
    console.log(`  DB_HOST: ${process.env.DB_HOST}`);
    console.log(`  DB_PORT: ${process.env.DB_PORT}`);
    console.log(`  DB_USER: ${process.env.DB_USER}`);
    console.log(`  DB_DATABASE: ${process.env.DB_DATABASE}`);
    console.log(`  DB_PASSWORD: ${process.env.DB_PASSWORD ? '***' : 'NOT SET'}`);
    console.log('\nAttempting to connect...\n');

    try {
        // ลองเชื่อมต่อ
        const connection = await pool.getConnection();
        console.log('✅ Successfully connected to database!');

        // ตรวจสอบตาราง users
        const result = await connection.query('SELECT COUNT(*) as count FROM users');
        console.log(`✅ Users table found - Total users: ${result[0].count}`);

        // ตรวจสอบตาราง posts
        const postsResult = await connection.query('SELECT COUNT(*) as count FROM posts');
        console.log(`✅ Posts table found - Total posts: ${postsResult[0].count}`);

        // แสดง 3 users แรก
        const users = await connection.query('SELECT user_id, full_name, phone_number, is_blocked, created_at FROM users LIMIT 3');
        console.log('\n📋 Sample users from database:');
        users.forEach((user, i) => {
        console.log(`   ${i+1}. ${user.full_name} (${user.phone_number}) - ${user.is_blocked ? '🔒 BANNED' : '✅ ACTIVE'}`);
        });

        connection.release();
        console.log('\n✅ DATABASE CONNECTION TEST PASSED!\n');
        process.exit(0);

    } catch (error) {
        console.error('\n❌ DATABASE CONNECTION FAILED!\n');
        console.error('Error Details:');
        console.error(`  Type: ${error.code}`);
        console.error(`  Message: ${error.message}`);
        console.error(`  SQL State: ${error.sqlState}`);
        console.error('\n⚠️  Possible Causes:');
        console.error('  1. Cloud SQL instance not running (34.126.155.104:3306)');
        console.error('  2. .env credentials are incorrect');
        console.error('  3. Network firewall blocking connection');
        console.error('  4. Database "eldersspace" does not exist\n');
        process.exit(1);
    }
}

checkDatabaseConnection();
