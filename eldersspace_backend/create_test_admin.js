#!/usr/bin/env node
/**
 * Create Test Admin Account for Admin Panel
 * Usage: node create_test_admin.js
 */

require('dotenv').config();
const pool = require('./config/db');

async function createTestAdmin() {
  const conn = await pool.getConnection();
  
  try {
    const phone = '0650479951';
    const adminSecret = process.env.ADMIN_AUTH_SECRET || 'eldersspace-admin-secret-change-me';
    
    console.log('\n🔐 Creating Test Admin Account...\n');
    console.log(`📱 Phone: ${phone}`);
    console.log(`🔑 Secret: ${adminSecret}`);
    
    // Check if already exists
    const [existing] = await conn.query(
      'SELECT phone FROM users WHERE phone = ? AND role = ?',
      [phone, 'admin']
    );
    
    if (existing.length > 0) {
      console.log('✓ Admin account already exists!\n');
      console.log('📋 Admin Details:');
      console.log(`   Phone: ${phone}`);
      console.log(`   Role: admin`);
      console.log(`   Status: Active\n`);
      
      console.log('🧪 To test admin login:');
      console.log('   1. Go to: index.html');
      console.log('   2. Enter phone: ' + phone);
      console.log('   3. Click "ขอรหัส OTP"');
      console.log('   4. Check backend console for OTP code');
      console.log('   5. Enter OTP and login\n');
      
      conn.release();
      return;
    }
    
    // Create admin user
    await conn.query(
      `INSERT INTO users (phone, full_name, role, created_at) 
       VALUES (?, ?, ?, NOW())`,
      [phone, 'Admin Test Account', 'admin']
    );
    
    console.log('✅ Admin account created successfully!\n');
    console.log('📋 Admin Credentials:');
    console.log(`   Phone: ${phone}`);
    console.log(`   Role: admin`);
    console.log(`   Status: Ready\n`);
    
    console.log('🧪 To test admin login:');
    console.log('   1. Go to: index.html');
    console.log('   2. Enter phone: ' + phone);
    console.log('   3. Click "ขอรหัส OTP"');
    console.log('   4. Check backend console for OTP code');
    console.log('   5. Enter OTP and login\n');
    
    console.log('💡 Tip: Check the backend terminal output for OTP code');
    console.log('   (Backend logs OTP when NODE_ENV=development)\n');
    
  } catch (error) {
    console.error('❌ Error creating admin:', error.message);
  } finally {
    conn.release();
    process.exit(0);
  }
}

createTestAdmin();
