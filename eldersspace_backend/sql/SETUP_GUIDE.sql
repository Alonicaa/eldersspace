-- ============================================================
-- ELDERSSPACE DATABASE SETUP GUIDE
-- ============================================================
-- This file provides step-by-step instructions for setting up
-- the eldersspace database from scratch or updating existing DB
-- ============================================================

-- ============================================================
-- STEP 1: CREATE DATABASE
-- ============================================================

-- Check if database exists
SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA 
WHERE SCHEMA_NAME = 'eldersspace';

-- Create database if it doesn't exist
CREATE DATABASE IF NOT EXISTS eldersspace 
CHARACTER SET utf8mb4 
COLLATE utf8mb4_unicode_ci;

-- Use the database
USE eldersspace;

-- ============================================================
-- STEP 2: VERIFY ENVIRONMENT
-- ============================================================

-- Show current database
SELECT DATABASE();

-- Show MySQL version (should be 5.7 or higher)
SELECT VERSION();

-- Show default character set
SHOW VARIABLES LIKE 'character_set_database';
SHOW VARIABLES LIKE 'collation_database';

-- ============================================================
-- STEP 3: LOAD COMPLETE SCHEMA
-- ============================================================

-- Option A: Source the complete schema file
-- SOURCE /path/to/eldersspace_backend/sql/complete_database_schema.sql;

-- Option B: Or run it piece by piece (see complete_database_schema.sql)

-- ============================================================
-- STEP 4: VERIFY INSTALLATION
-- ============================================================

-- List all tables
SHOW TABLES;

-- Count should be 28
SELECT COUNT(*) as table_count FROM INFORMATION_SCHEMA.TABLES 
WHERE TABLE_SCHEMA = DATABASE();

-- ============================================================
-- STEP 5: INITIALIZE REQUIRED DATA
-- ============================================================

-- INSERT reward settings (REQUIRED - exactly 1 row)
INSERT IGNORE INTO reward_settings (setting_id) VALUES (1);

-- Verify settings were created
SELECT * FROM reward_settings;

-- ============================================================
-- STEP 6: CREATE SAMPLE DATA (OPTIONAL)
-- ============================================================

-- Create admin user
INSERT IGNORE INTO users (full_name, phone_number, role, is_verified)
VALUES ('Admin User', '0800000001', 'admin', 1);

-- Create sample elder user
INSERT IGNORE INTO users (full_name, phone_number, role, is_verified, total_points, login_streak)
VALUES ('Sample Elder', '0800000002', 'elder', 1, 100, 5);

-- Add sample rewards
INSERT IGNORE INTO rewards (reward_name, description, points_required, category, is_active, stock)
VALUES 
  ('Coffee', 'Free Coffee (1 cup)', 50, 'Beverages', 1, 100),
  ('Tea', 'Free Tea (1 cup)', 40, 'Beverages', 1, 100),
  ('Movie Ticket', 'Movie Theater Ticket', 150, 'Entertainment', 1, 50),
  ('Book Voucher', '100 Baht Book Store Voucher', 100, 'Education', 1, 75);

-- Verify data
SELECT COUNT(*) FROM users;
SELECT COUNT(*) FROM rewards;
SELECT * FROM reward_settings;

-- ============================================================
-- STEP 7: VERIFY FOREIGN KEY INTEGRITY
-- ============================================================

-- Check if foreign keys are enabled
SHOW VARIABLES LIKE 'foreign_key_checks';

-- Enable foreign keys (should be ON by default)
SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
-- STEP 8: CHECK INDEXES
-- ============================================================

-- List all indexes on users table
SHOW INDEX FROM users;

-- List all indexes on posts table
SHOW INDEX FROM posts;

-- Count total indexes
SELECT COUNT(*) as index_count FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_SCHEMA = DATABASE();

-- ============================================================
-- STEP 9: BACKUP FRESH SCHEMA
-- ============================================================

-- From command line (after setup):
-- mysqldump -u user -p eldersspace > eldersspace_fresh_schema.sql

-- ============================================================
-- STEP 10: RUNNING INCREMENTAL MIGRATIONS
-- ============================================================

-- If updating existing database, run these files sequentially:
-- 1. sql/users_table_schema.sql - (already covered in main schema)
-- 2. sql/add_profile_details.sql - (already covered in main schema)
-- 3. sql/migration_2024_reward_management.sql - (need to apply ALTER statements)
-- 4. sql/create_notifications_table.sql - (already covered in main schema)
-- 5. sql/create_qr_codes_table.sql - (already covered in main schema)
-- 6. sql/create_qr_logs_table.sql - (already covered in main schema)
-- Additional scripts:
-- - scripts/add_activity_rewards.js - run: node add_activity_rewards.js
-- - scripts/add_promo_campaigns.js - run: node add_promo_campaigns.js

-- ============================================================
-- TROUBLESHOOTING
-- ============================================================

-- Check for table creation errors
SHOW WARNINGS;

-- Check table status
SHOW TABLE STATUS WHERE Db = 'eldersspace';

-- Check foreign key constraints
SELECT CONSTRAINT_NAME, TABLE_NAME, REFERENCED_TABLE_NAME 
FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
WHERE TABLE_SCHEMA = 'eldersspace' AND REFERENCED_TABLE_NAME IS NOT NULL;

-- Check for duplicate entries (if you run setup multiple times)
SELECT phone_number, COUNT(*) as count FROM users GROUP BY phone_number HAVING count > 1;

-- Fix: If you have duplicates, clear and start over
-- TRUNCATE TABLE users;
-- TRUNCATE TABLE followers;
-- etc... (in dependency order)

-- ============================================================
-- STEP 11: DATABASE STATISTICS
-- ============================================================

-- Show database size
SELECT 
  table_schema as 'Database',
  ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) as 'Size in MB'
FROM information_schema.tables 
WHERE table_schema = 'eldersspace'
GROUP BY table_schema;

-- Show table sizes
SELECT 
  TABLE_NAME as 'Table',
  ROUND(((data_length + index_length) / 1024 / 1024), 2) as 'Size (MB)',
  TABLE_ROWS as 'Rows'
FROM information_schema.tables
WHERE table_schema = 'eldersspace'
ORDER BY (data_length + index_length) DESC;

-- ============================================================
-- FINAL VERIFICATION QUERIES
-- ============================================================

-- 1. Count tables
SELECT COUNT(*) as 'Total Tables' FROM INFORMATION_SCHEMA.TABLES 
WHERE TABLE_SCHEMA = 'eldersspace';

-- 2. Count columns
SELECT COUNT(*) as 'Total Columns' FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_SCHEMA = 'eldersspace';

-- 3. Count foreign keys
SELECT COUNT(*) as 'Total Foreign Keys' FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
WHERE TABLE_SCHEMA = 'eldersspace' AND REFERENCED_TABLE_NAME IS NOT NULL;

-- 4. Count indexes
SELECT COUNT(*) as 'Total Indexes' FROM INFORMATION_SCHEMA.STATISTICS 
WHERE TABLE_SCHEMA = 'eldersspace' AND SEQ_IN_INDEX = 1;

-- 5. Verify critical tables exist
SELECT 'users' as table_name, COUNT(*) as exists_flag FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'eldersspace' AND TABLE_NAME = 'users'
UNION ALL
SELECT 'posts', COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'eldersspace' AND TABLE_NAME = 'posts'
UNION ALL
SELECT 'rewards', COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'eldersspace' AND TABLE_NAME = 'rewards'
UNION ALL
SELECT 'notifications', COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'eldersspace' AND TABLE_NAME = 'notifications'
UNION ALL
SELECT 'security_logs', COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'eldersspace' AND TABLE_NAME = 'security_logs';

-- ============================================================
-- SUCCESS CRITERIA
-- ============================================================

-- After running all steps, you should see:
-- ✓ 28 tables created
-- ✓ All foreign keys working
-- ✓ All indexes created
-- ✓ reward_settings has 1 row
-- ✓ Sample data inserted (if Step 6 was run)
-- ✓ No error messages

-- ============================================================
-- NEXT STEPS
-- ============================================================

-- 1. Start the Node.js backend server
--    cd eldersspace_backend
--    npm install (if not already done)
--    node server.js

-- 2. Initialize Flutter app and run
--    cd eldersspace
--    flutter pub get
--    flutter run

-- 3. Access admin dashboard at http://localhost:3000/admin

-- ============================================================
-- MAINTENANCE COMMANDS
-- ============================================================

-- Regular analysis (weekly)
-- ANALYZE TABLE users, posts, comments, rewards;

-- Regular optimization (monthly)
-- OPTIMIZE TABLE users, posts, comments, rewards;

-- Check for corruption (monthly)
-- CHECK TABLE users, posts, comments, rewards;

-- Backup schedule (daily)
-- mysqldump -u user -p --single-transaction eldersspace > daily_backup.sql

-- ============================================================
-- END OF SETUP GUIDE
-- ============================================================
