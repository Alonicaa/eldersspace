-- Create QR Codes table for reward redemption tracking
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
);
