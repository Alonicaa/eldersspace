-- ============================================================
-- ELDERSSPACE COMPLETE DATABASE SCHEMA
-- Complete SQL dump with all table creation statements
-- This script recreates the entire database from scratch
-- ============================================================
-- Encoding: UTF-8
-- Database: eldersspace
-- Created: 2026-05-11
-- ============================================================

-- ============================================================
-- 1. CORE USER MANAGEMENT TABLES
-- ============================================================

-- Users table (base user information)
CREATE TABLE IF NOT EXISTS users (
  user_id INT AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(255) NOT NULL,
  phone_number VARCHAR(20) UNIQUE NOT NULL,
  password VARCHAR(255),
  profile_picture VARCHAR(255),
  role ENUM('admin', 'elder', 'caregiver') DEFAULT 'elder',
  is_verified BOOLEAN DEFAULT FALSE,
  
  -- Profile Details Columns
  current_location VARCHAR(255),
  hometown VARCHAR(255),
  birth_date DATE,
  relationship_status VARCHAR(50),
  family_info VARCHAR(255),
  gender VARCHAR(50),
  pronouns VARCHAR(50),
  
  -- About Me
  about_me TEXT,
  
  -- Activity Reward Flags
  profile_completion_rewarded BOOLEAN DEFAULT FALSE,
  verified_account_rewarded BOOLEAN DEFAULT FALSE,
  
  -- Account Status
  total_points INT DEFAULT 0,
  login_streak INT DEFAULT 0,
  last_checkin_date DATE,
  last_login_at TIMESTAMP NULL,
  
  -- Moderation
  is_blocked BOOLEAN DEFAULT FALSE,
  blocked_reason VARCHAR(255),
  warning_note TEXT,
  blocked_at TIMESTAMP NULL,
  blocked_by INT NULL,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_phone_number (phone_number),
  INDEX idx_role (role),
  INDEX idx_is_blocked (is_blocked),
  INDEX idx_total_points (total_points),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Followers table (follow relationships)
CREATE TABLE IF NOT EXISTS followers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  follower_id INT NOT NULL,
  following_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE KEY unique_follow (follower_id, following_id),
  INDEX idx_follower_id (follower_id),
  INDEX idx_following_id (following_id),
  
  CONSTRAINT fk_followers_follower FOREIGN KEY (follower_id) REFERENCES users(user_id) ON DELETE CASCADE,
  CONSTRAINT fk_followers_following FOREIGN KEY (following_id) REFERENCES users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 2. CONTENT MANAGEMENT TABLES
-- ============================================================

-- Posts table (user posts and shares)
CREATE TABLE IF NOT EXISTS posts (
  post_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  content LONGTEXT,
  visibility VARCHAR(20) DEFAULT 'public',
  shared_post_id INT NULL,
  is_deleted TINYINT DEFAULT 0,
  deleted_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_user_id (user_id),
  INDEX idx_shared_post_id (shared_post_id),
  INDEX idx_is_deleted (is_deleted),
  INDEX idx_created_at (created_at),
  INDEX idx_visibility (visibility),
  
  CONSTRAINT fk_posts_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  CONSTRAINT fk_posts_shared FOREIGN KEY (shared_post_id) REFERENCES posts(post_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Post images table
CREATE TABLE IF NOT EXISTS post_images (
  image_id INT AUTO_INCREMENT PRIMARY KEY,
  post_id INT NOT NULL,
  image_url VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_post_id (post_id),
  CONSTRAINT fk_post_images_post FOREIGN KEY (post_id) REFERENCES posts(post_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Post likes/reactions table
CREATE TABLE IF NOT EXISTS post_likes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  post_id INT NOT NULL,
  user_id INT NOT NULL,
  type ENUM('like', 'dislike') DEFAULT 'like',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE KEY unique_like (post_id, user_id),
  INDEX idx_post_id (post_id),
  INDEX idx_user_id (user_id),
  INDEX idx_type (type),
  
  CONSTRAINT fk_post_likes_post FOREIGN KEY (post_id) REFERENCES posts(post_id) ON DELETE CASCADE,
  CONSTRAINT fk_post_likes_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Comments table
CREATE TABLE IF NOT EXISTS comments (
  comment_id INT AUTO_INCREMENT PRIMARY KEY,
  post_id INT NOT NULL,
  user_id INT NOT NULL,
  parent_id INT NULL,
  content TEXT,
  is_deleted TINYINT DEFAULT 0,
  deleted_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_post_id (post_id),
  INDEX idx_user_id (user_id),
  INDEX idx_parent_id (parent_id),
  INDEX idx_is_deleted (is_deleted),
  INDEX idx_created_at (created_at),
  
  CONSTRAINT fk_comments_post FOREIGN KEY (post_id) REFERENCES posts(post_id) ON DELETE CASCADE,
  CONSTRAINT fk_comments_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  CONSTRAINT fk_comments_parent FOREIGN KEY (parent_id) REFERENCES comments(comment_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 3. REPORTING AND MODERATION TABLES
-- ============================================================

-- Post reports table
CREATE TABLE IF NOT EXISTS post_reports (
  report_id INT AUTO_INCREMENT PRIMARY KEY,
  post_id INT NOT NULL,
  reporter_user_id INT NOT NULL,
  reason VARCHAR(100) NULL,
  detail TEXT NULL,
  status ENUM('pending','reviewed','dismissed') NOT NULL DEFAULT 'pending',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  UNIQUE KEY uniq_post_reporter (post_id, reporter_user_id),
  INDEX idx_post_reports_post_id (post_id),
  INDEX idx_post_reports_status_created (status, created_at),
  
  CONSTRAINT fk_post_reports_post FOREIGN KEY (post_id) REFERENCES posts(post_id) ON DELETE CASCADE,
  CONSTRAINT fk_post_reports_reporter FOREIGN KEY (reporter_user_id) REFERENCES users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Comment reports table
CREATE TABLE IF NOT EXISTS comment_reports (
  report_id INT AUTO_INCREMENT PRIMARY KEY,
  comment_id INT NOT NULL,
  reporter_user_id INT NOT NULL,
  reason VARCHAR(100) NULL,
  detail TEXT NULL,
  status ENUM('pending','reviewed','dismissed') NOT NULL DEFAULT 'pending',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  UNIQUE KEY uniq_comment_reporter (comment_id, reporter_user_id),
  INDEX idx_comment_reports_comment_id (comment_id),
  INDEX idx_comment_reports_status_created (status, created_at),
  
  CONSTRAINT fk_comment_reports_comment FOREIGN KEY (comment_id) REFERENCES comments(comment_id) ON DELETE CASCADE,
  CONSTRAINT fk_comment_reports_reporter FOREIGN KEY (reporter_user_id) REFERENCES users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Post moderation logs
CREATE TABLE IF NOT EXISTS post_moderation_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  post_id INT NOT NULL,
  admin_actor VARCHAR(255) NOT NULL,
  action VARCHAR(50) NOT NULL,
  reason VARCHAR(255) NULL,
  note TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  PRIMARY KEY (id),
  INDEX idx_post_moderation_logs_post_id (post_id),
  INDEX idx_post_moderation_logs_created_at (created_at),
  
  CONSTRAINT fk_post_moderation_logs_post FOREIGN KEY (post_id) REFERENCES posts(post_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 4. NOTIFICATIONS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS notifications (
  notification_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  actor_id INT NOT NULL,
  post_id INT NULL,
  type ENUM('like','comment','reply','follow','share','reward_redemption') NOT NULL DEFAULT 'like',
  content LONGTEXT NULL DEFAULT NULL COMMENT 'JSON data for reward notifications',
  reward_name VARCHAR(255) NULL DEFAULT NULL,
  qr_code VARCHAR(255) NULL DEFAULT NULL,
  redemption_id INT NULL,
  is_read TINYINT(1) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_user_id (user_id),
  INDEX idx_actor_id (actor_id),
  INDEX idx_post_id (post_id),
  INDEX idx_type (type),
  INDEX idx_notifications_type_created (type, created_at DESC),
  INDEX idx_is_read (is_read),
  INDEX idx_notifications_redemption_id (redemption_id),
  
  CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  CONSTRAINT fk_notifications_actor FOREIGN KEY (actor_id) REFERENCES users(user_id) ON DELETE CASCADE,
  CONSTRAINT fk_notifications_post FOREIGN KEY (post_id) REFERENCES posts(post_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 5. REWARDS AND INCENTIVE TABLES
-- ============================================================

-- Rewards (incentives) table
CREATE TABLE IF NOT EXISTS rewards (
  reward_id INT AUTO_INCREMENT PRIMARY KEY,
  reward_name VARCHAR(255) NOT NULL,
  description TEXT,
  points_required INT NOT NULL,
  category VARCHAR(100),
  image_url VARCHAR(500) NULL,
  usage_instructions TEXT NULL,
  is_active TINYINT DEFAULT 1,
  stock INT DEFAULT 0,
  user_limit INT DEFAULT -1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_category (category),
  INDEX idx_is_active (is_active),
  INDEX idx_points_required (points_required),
  INDEX idx_image_url (image_url),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Reward settings table
CREATE TABLE IF NOT EXISTS reward_settings (
  setting_id INT AUTO_INCREMENT PRIMARY KEY,
  points_per_minute INT DEFAULT 1,
  session_bonus_threshold INT DEFAULT 40,
  session_bonus_points INT DEFAULT 8,
  usage_reward_daily_limit_count INT NOT NULL DEFAULT 2,
  daily_login_bonus INT DEFAULT 5,
  daily_login_bonus_3x_threshold INT DEFAULT 7,
  daily_login_bonus_3x_multiplier INT DEFAULT 3,
  streak_milestone_bonus INT DEFAULT 100,
  streak_milestone_days INT NOT NULL DEFAULT 30,
  profile_completion_points INT NOT NULL DEFAULT 50,
  post_activity_points INT NOT NULL DEFAULT 10,
  post_activity_required_posts INT NOT NULL DEFAULT 2,
  comment_activity_points INT NOT NULL DEFAULT 2,
  comment_activity_daily_limit_count INT NOT NULL DEFAULT 5,
  share_activity_points INT NOT NULL DEFAULT 10,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Bonus events table
CREATE TABLE IF NOT EXISTS bonus_events (
  event_id INT AUTO_INCREMENT PRIMARY KEY,
  event_name VARCHAR(255) NOT NULL,
  event_type VARCHAR(50),
  points_awarded INT NOT NULL,
  description TEXT,
  start_date DATETIME,
  end_date DATETIME,
  is_active TINYINT DEFAULT 1,
  max_points_per_user INT NULL,
  bonus_type VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_event_type (event_type),
  INDEX idx_is_active (is_active),
  INDEX idx_dates (start_date, end_date),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 6. PROMO CODE AND CAMPAIGN TABLES
-- ============================================================

-- Promo campaigns table
CREATE TABLE IF NOT EXISTS promo_campaigns (
  campaign_id INT PRIMARY KEY AUTO_INCREMENT,
  reward_id INT NOT NULL,
  campaign_name VARCHAR(255) NOT NULL,
  campaign_start_date DATETIME NOT NULL,
  campaign_end_date DATETIME NOT NULL,
  description TEXT,
  is_active TINYINT DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  KEY idx_reward (reward_id),
  KEY idx_active (is_active),
  KEY idx_dates (campaign_start_date, campaign_end_date),
  
  FOREIGN KEY (reward_id) REFERENCES rewards(reward_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Promo codes table
CREATE TABLE IF NOT EXISTS promo_codes (
  promo_code_id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(255) NOT NULL UNIQUE,
  reward_id INT NOT NULL,
  campaign_id INT NULL,
  description TEXT NULL,
  expiry_date DATE NULL,
  is_used TINYINT(1) DEFAULT 0,
  used_by_user_id INT NULL,
  used_by_phone VARCHAR(20) NULL,
  used_at DATETIME NULL,
  uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  batch_upload_id VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (reward_id) REFERENCES rewards(reward_id) ON DELETE CASCADE,
  FOREIGN KEY (used_by_user_id) REFERENCES users(user_id) ON DELETE SET NULL,
  FOREIGN KEY (campaign_id) REFERENCES promo_campaigns(campaign_id) ON DELETE CASCADE,
  
  INDEX idx_code (code),
  INDEX idx_reward_id (reward_id),
  INDEX idx_is_used (is_used),
  INDEX idx_expiry_date (expiry_date),
  INDEX idx_used_by_user_id (used_by_user_id),
  INDEX idx_campaign (campaign_id),
  INDEX idx_uploaded (uploaded_at),
  INDEX idx_batch (batch_upload_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Promo code logs table (audit trail)
CREATE TABLE IF NOT EXISTS promo_code_logs (
  log_id INT AUTO_INCREMENT PRIMARY KEY,
  promo_code_id INT NOT NULL,
  action VARCHAR(50) NOT NULL,
  user_id INT NULL,
  phone_number VARCHAR(20) NULL,
  reward_id INT NULL,
  details TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (promo_code_id) REFERENCES promo_codes(promo_code_id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL,
  FOREIGN KEY (reward_id) REFERENCES rewards(reward_id) ON DELETE SET NULL,
  
  INDEX idx_promo_code_id (promo_code_id),
  INDEX idx_action (action),
  INDEX idx_user_id (user_id),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Promo code redemptions table
CREATE TABLE IF NOT EXISTS promo_code_redemptions (
  redemption_id INT PRIMARY KEY AUTO_INCREMENT,
  promo_code_id INT NOT NULL,
  code VARCHAR(100),
  redeemed_by_user_id INT,
  redeemed_by_phone VARCHAR(20),
  redeemed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  reward_id INT,
  points_awarded INT,
  device_info TEXT,
  ip_address VARCHAR(45),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (promo_code_id) REFERENCES promo_codes(promo_code_id),
  
  KEY idx_code_id (promo_code_id),
  KEY idx_phone (redeemed_by_phone),
  KEY idx_redeemed_at (redeemed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 7. QR CODE AND REWARD REDEMPTION TABLES
-- ============================================================

-- QR codes table
CREATE TABLE IF NOT EXISTS qr_codes (
  qr_id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(255) UNIQUE NOT NULL,
  user_id INT NOT NULL,
  reward_id INT NOT NULL,
  phone_number VARCHAR(20) NOT NULL,
  points_redeemed INT NOT NULL,
  is_used BOOLEAN DEFAULT FALSE,
  used_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  
  FOREIGN KEY (user_id) REFERENCES users(user_id),
  FOREIGN KEY (reward_id) REFERENCES rewards(reward_id),
  
  INDEX idx_code (code),
  INDEX idx_user_id (user_id),
  INDEX idx_phone (phone_number),
  INDEX idx_used (is_used),
  INDEX idx_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- QR code logs table
CREATE TABLE IF NOT EXISTS qr_code_logs (
  log_id INT AUTO_INCREMENT PRIMARY KEY,
  qr_id INT NOT NULL,
  qr_code VARCHAR(255) NOT NULL,
  user_id INT NOT NULL,
  phone_number VARCHAR(20) NOT NULL,
  action VARCHAR(50) NOT NULL,
  status VARCHAR(50),
  error_message TEXT,
  ip_address VARCHAR(45),
  user_agent TEXT,
  scanned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (qr_id) REFERENCES qr_codes(qr_id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  
  INDEX idx_qr_code (qr_code),
  INDEX idx_qr_id (qr_id),
  INDEX idx_user_id (user_id),
  INDEX idx_action (action),
  INDEX idx_scanned_at (scanned_at),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Reward redemption history table
CREATE TABLE IF NOT EXISTS reward_redemption_history (
  redemption_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  phone_number VARCHAR(20) NOT NULL,
  reward_id INT NOT NULL,
  reward_name VARCHAR(255),
  points_redeemed INT NOT NULL,
  qr_code VARCHAR(255) UNIQUE,
  redemption_status VARCHAR(50) NOT NULL DEFAULT 'pending',
  redeemed_at TIMESTAMP,
  scanned_at TIMESTAMP NULL,
  used_at TIMESTAMP NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  FOREIGN KEY (reward_id) REFERENCES rewards(reward_id) ON DELETE CASCADE,
  
  INDEX idx_user_phone (user_id, phone_number),
  INDEX idx_reward_id (reward_id),
  INDEX idx_qr_code (qr_code),
  INDEX idx_status (redemption_status),
  INDEX idx_redeemed_at (redeemed_at),
  INDEX idx_expires_at (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 8. ACTIVITY-BASED REWARDS TABLES
-- ============================================================

-- Post activity rewards table
CREATE TABLE IF NOT EXISTS post_activity_rewards (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  phone_number VARCHAR(20),
  reward_date DATE NOT NULL,
  post_count INT DEFAULT 0,
  points_awarded INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  
  UNIQUE KEY unique_user_date (user_id, reward_date),
  INDEX idx_phone (phone_number),
  INDEX idx_date (reward_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Comment activity rewards table
CREATE TABLE IF NOT EXISTS comment_activity_rewards (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  phone_number VARCHAR(20),
  reward_date DATE NOT NULL,
  comment_count INT DEFAULT 0,
  points_awarded INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  
  UNIQUE KEY unique_user_date (user_id, reward_date),
  INDEX idx_phone (phone_number),
  INDEX idx_date (reward_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Share activity rewards table
CREATE TABLE IF NOT EXISTS share_activity_rewards (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  phone_number VARCHAR(20),
  reward_date DATE NOT NULL,
  shared_post_id INT NOT NULL,
  points_awarded INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  FOREIGN KEY (shared_post_id) REFERENCES posts(post_id) ON DELETE CASCADE,
  
  UNIQUE KEY unique_user_shared_post (user_id, shared_post_id),
  INDEX idx_share_phone (phone_number),
  INDEX idx_share_date (reward_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Account milestone rewards table
CREATE TABLE IF NOT EXISTS account_milestone_rewards (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  phone_number VARCHAR(20),
  milestone_type VARCHAR(50) NOT NULL,
  points_awarded INT DEFAULT 0,
  rewarded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  
  UNIQUE KEY unique_milestone (user_id, milestone_type),
  INDEX idx_phone (phone_number),
  INDEX idx_type (milestone_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 9. SESSION AND ACTIVITY TRACKING TABLES
-- ============================================================

-- App sessions table
CREATE TABLE IF NOT EXISTS app_sessions (
  session_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  phone_number VARCHAR(20),
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ended_at TIMESTAMP NULL,
  duration_minutes INT,
  points_awarded INT DEFAULT 0,
  device_info VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  
  INDEX idx_user_id (user_id),
  INDEX idx_phone_number (phone_number),
  INDEX idx_started_at (started_at),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Points transactions table
CREATE TABLE IF NOT EXISTS points_transactions (
  transaction_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  source_type VARCHAR(50) DEFAULT 'admin',
  points DECIMAL(10,2) NOT NULL,
  type VARCHAR(10) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  
  INDEX idx_user_id (user_id),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 10. LOGGING AND AUDIT TABLES
-- ============================================================

-- Security logs table
CREATE TABLE IF NOT EXISTS security_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  event_type VARCHAR(64) NOT NULL,
  actor_name VARCHAR(255) NULL,
  actor_phone VARCHAR(50) NULL,
  target_name VARCHAR(255) NULL,
  target_phone VARCHAR(50) NULL,
  ip_address VARCHAR(64) NULL,
  device VARCHAR(255) NULL,
  detail TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  PRIMARY KEY (id),
  INDEX idx_security_logs_created_at (created_at),
  INDEX idx_security_logs_event_type_created (event_type, created_at),
  INDEX idx_security_logs_actor_phone (actor_phone),
  INDEX idx_security_logs_target_phone (target_phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Admin logs table
CREATE TABLE IF NOT EXISTS admin_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  event VARCHAR(500) NOT NULL,
  `user` VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  PRIMARY KEY (id),
  INDEX idx_admin_logs_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- END OF SCHEMA
-- ============================================================
-- Total tables created: 28
-- Database: eldersspace
-- Character set: utf8mb4
-- Collation: utf8mb4_unicode_ci
-- ============================================================
