-- User code reports: users report issues with promo codes they received
CREATE TABLE IF NOT EXISTS user_code_reports (
  report_id       INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id         INT UNSIGNED NOT NULL,
  phone_number    VARCHAR(20)  NOT NULL,
  promo_code_id   INT UNSIGNED NOT NULL,           -- references promo_codes.promo_code_id
  reward_id       INT UNSIGNED NOT NULL,
  reward_name     VARCHAR(255),
  issue_type      ENUM('not_working','wrong_reward','already_expired','other') NOT NULL DEFAULT 'other',
  description     TEXT,
  status          ENUM('pending','investigating','resolved','rejected') NOT NULL DEFAULT 'pending',
  admin_note      TEXT,
  resolved_at     DATETIME DEFAULT NULL,
  is_deleted      TINYINT(1)   NOT NULL DEFAULT 0,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_user_id (user_id),
  INDEX idx_promo_code_id (promo_code_id),
  INDEX idx_status (status),
  INDEX idx_is_deleted (is_deleted)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
