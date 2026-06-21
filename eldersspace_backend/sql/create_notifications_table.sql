-- ============================================
-- Create Notifications Table
-- ============================================
-- This table stores all notifications including likes, comments, follows, and reward redemptions

CREATE TABLE IF NOT EXISTS notifications (
  notification_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  actor_id INT NOT NULL,
  post_id INT NULL,
  type ENUM('like','comment','reply','follow','share','reward_redemption') NOT NULL DEFAULT 'like',
  content LONGTEXT NULL DEFAULT NULL COMMENT 'JSON data for reward notifications',
  reward_name VARCHAR(255) NULL DEFAULT NULL,
  qr_code VARCHAR(255) NULL DEFAULT NULL,
  is_read TINYINT(1) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  -- Indexes for performance
  INDEX idx_user_id (user_id),
  INDEX idx_actor_id (actor_id),
  INDEX idx_post_id (post_id),
  INDEX idx_type (type),
  INDEX idx_notifications_type_created (type, created_at DESC),
  INDEX idx_is_read (is_read),
  
  -- Foreign keys for data integrity
  CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  CONSTRAINT fk_notifications_actor FOREIGN KEY (actor_id) REFERENCES users(user_id) ON DELETE CASCADE,
  CONSTRAINT fk_notifications_post FOREIGN KEY (post_id) REFERENCES posts(post_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- Verify the table
-- ============================================
-- DESCRIBE notifications;
-- SELECT * FROM notifications LIMIT 5;
