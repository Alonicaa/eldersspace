-- ============================================
-- Complete Enhanced Users Table Schema
-- ============================================
-- This shows the full users table structure with new profile details columns

CREATE TABLE IF NOT EXISTS users (
  user_id INT AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(255) NOT NULL,
  phone_number VARCHAR(20) UNIQUE NOT NULL,
  password VARCHAR(255),
  profile_picture VARCHAR(255),
  role ENUM('admin', 'elder', 'caregiver') DEFAULT 'elder',
  is_verified BOOLEAN DEFAULT FALSE,
  
  -- Profile Details Columns (NEW)
  current_location VARCHAR(255),
  hometown VARCHAR(255),
  birth_date DATE,
  relationship_status VARCHAR(50),
  family_info VARCHAR(255),
  gender VARCHAR(50),
  pronouns VARCHAR(50),
  
  -- About Me (existing)
  about_me TEXT,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  is_blocked BOOLEAN DEFAULT FALSE,
  blocked_reason VARCHAR(255),
  warning_note TEXT,
  blocked_at TIMESTAMP NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- Create Index for Performance
-- ============================================
CREATE INDEX idx_phone_number ON users(phone_number);
CREATE INDEX idx_role ON users(role);

-- ============================================
-- Check Current Schema
-- ============================================
-- DESCRIBE users;
