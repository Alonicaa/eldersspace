-- Migration: Add Reward Management Columns (Stock, User Limit)
-- Date: 2024
-- Purpose: Support image storage and reward stock management

-- Add columns to rewards table if not exists
ALTER TABLE rewards 
ADD COLUMN IF NOT EXISTS `stock` INT DEFAULT 0 AFTER `is_active`,
ADD COLUMN IF NOT EXISTS `user_limit` INT DEFAULT -1 AFTER `stock`;

-- Verify columns exist
SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_SCHEMA = DATABASE() 
AND TABLE_NAME = 'rewards' 
AND COLUMN_NAME IN ('stock', 'user_limit');

-- Create promo_codes table if not exists
CREATE TABLE IF NOT EXISTS `promo_codes` (
  `promo_code_id` INT AUTO_INCREMENT PRIMARY KEY,
  `code` VARCHAR(255) NOT NULL UNIQUE,
  `reward_id` INT NOT NULL,
  `description` TEXT NULL,
  `expiry_date` DATE NULL,
  `is_used` TINYINT(1) DEFAULT 0,
  `used_by_user_id` INT NULL,
  `used_by_phone` VARCHAR(20) NULL,
  `used_at` DATETIME NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (`reward_id`) REFERENCES `rewards`(`reward_id`) ON DELETE CASCADE,
  FOREIGN KEY (`used_by_user_id`) REFERENCES `users`(`user_id`) ON DELETE SET NULL,
  
  INDEX `idx_code` (`code`),
  INDEX `idx_reward_id` (`reward_id`),
  INDEX `idx_is_used` (`is_used`),
  INDEX `idx_expiry_date` (`expiry_date`),
  INDEX `idx_used_by_user_id` (`used_by_user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create promo_code_logs table if not exists (audit trail)
CREATE TABLE IF NOT EXISTS `promo_code_logs` (
  `log_id` INT AUTO_INCREMENT PRIMARY KEY,
  `promo_code_id` INT NOT NULL,
  `action` VARCHAR(50) NOT NULL,
  `user_id` INT NULL,
  `phone_number` VARCHAR(20) NULL,
  `reward_id` INT NULL,
  `details` TEXT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (`promo_code_id`) REFERENCES `promo_codes`(`promo_code_id`) ON DELETE CASCADE,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`user_id`) ON DELETE SET NULL,
  FOREIGN KEY (`reward_id`) REFERENCES `rewards`(`reward_id`) ON DELETE SET NULL,
  
  INDEX `idx_promo_code_id` (`promo_code_id`),
  INDEX `idx_action` (`action`),
  INDEX `idx_user_id` (`user_id`),
  INDEX `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Ensure rewards table has image_url column (for file upload support)
ALTER TABLE rewards 
ADD COLUMN IF NOT EXISTS `image_url` VARCHAR(500) NULL AFTER `description`;

-- Create index on image_url for faster lookups
ALTER TABLE rewards ADD INDEX IF NOT EXISTS `idx_image_url` (`image_url`);

-- Verify final rewards table structure
SELECT 
  COLUMN_NAME, 
  COLUMN_TYPE, 
  IS_NULLABLE, 
  COLUMN_DEFAULT 
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_SCHEMA = DATABASE() 
AND TABLE_NAME = 'rewards'
ORDER BY ORDINAL_POSITION;

-- Summary: All tables created/updated successfully
-- rewards: Added stock, user_limit, image_url columns
-- promo_codes: Full table for code management
-- promo_code_logs: Audit trail for all promo code actions
