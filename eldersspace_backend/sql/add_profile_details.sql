-- ============================================
-- Add Profile Details Columns to Users Table
-- ============================================
-- Run this SQL to add the profile detail columns

ALTER TABLE users ADD COLUMN IF NOT EXISTS current_location VARCHAR(255) DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS hometown VARCHAR(255) DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS birth_date DATE DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS relationship_status VARCHAR(50) DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS family_info VARCHAR(255) DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS gender VARCHAR(50) DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pronouns VARCHAR(50) DEFAULT NULL;

-- ============================================
-- Verify the columns were added
-- ============================================
-- DESCRIBE users;
-- Or: SHOW COLUMNS FROM users;

-- ============================================
-- Example Data Insert
-- ============================================
-- UPDATE users SET 
--   current_location = 'Pattani, Thailand',
--   hometown = 'Pattani, Thailand',
--   birth_date = '2004-06-26',
--   relationship_status = 'Single',
--   family_info = 'Family',
--   gender = 'Male',
--   pronouns = 'he/him'
-- WHERE phone_number = '0123456789';

-- ============================================
-- View Profile Details for a User
-- ============================================
-- SELECT phone_number, full_name, 
--        current_location, hometown, birth_date, 
--        relationship_status, family_info, gender, pronouns
-- FROM users 
-- WHERE phone_number = '0123456789';
