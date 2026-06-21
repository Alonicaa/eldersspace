-- Create QR Code Logs Table for tracking scans and verifications
CREATE TABLE IF NOT EXISTS qr_code_logs (
  log_id INT AUTO_INCREMENT PRIMARY KEY,
  qr_id INT NOT NULL,
  qr_code VARCHAR(255) NOT NULL,
  user_id INT NOT NULL,
  phone_number VARCHAR(20) NOT NULL,
  action VARCHAR(50) NOT NULL,                     -- 'verify', 'use', 'expire', 'failed'
  status VARCHAR(50),                              -- 'success', 'expired', 'already_used', 'invalid'
  error_message TEXT,                              -- Error details if action failed
  ip_address VARCHAR(45),                          -- IPv4 or IPv6
  user_agent TEXT,                                 -- Browser/scanner info
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

-- Create Reward Redemption History Table (alternative structure)
CREATE TABLE IF NOT EXISTS reward_redemption_history (
  redemption_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  phone_number VARCHAR(20) NOT NULL,
  reward_id INT NOT NULL,
  reward_name VARCHAR(255),
  points_redeemed INT NOT NULL,
  qr_code VARCHAR(255) UNIQUE,                      -- Link to QR code
  redemption_status VARCHAR(50) NOT NULL DEFAULT 'pending',  -- 'pending', 'scanned', 'used', 'expired', 'cancelled'
  redeemed_at TIMESTAMP,                            -- When user clicked redeem
  scanned_at TIMESTAMP NULL,                        -- When shop scanned QR
  used_at TIMESTAMP NULL,                           -- When shop marked as used
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
