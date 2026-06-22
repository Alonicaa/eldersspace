-- User code reports: users report issues with promo codes they received
CREATE TABLE IF NOT EXISTS user_code_reports (
  report_id       SERIAL PRIMARY KEY,
  user_id         INTEGER      NOT NULL,
  phone_number    VARCHAR(20)  NOT NULL,
  promo_code_id   INTEGER      NOT NULL,
  reward_id       INTEGER      NOT NULL,
  reward_name     VARCHAR(255),
  issue_type      VARCHAR(20)  NOT NULL DEFAULT 'other'
                  CHECK (issue_type IN ('not_working','wrong_reward','already_expired','other')),
  description     TEXT,
  status          VARCHAR(20)  NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','investigating','resolved','rejected')),
  admin_note      TEXT,
  resolved_at     TIMESTAMPTZ  DEFAULT NULL,
  is_deleted      SMALLINT     NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ucr_user_id       ON user_code_reports (user_id);
CREATE INDEX IF NOT EXISTS idx_ucr_promo_code_id ON user_code_reports (promo_code_id);
CREATE INDEX IF NOT EXISTS idx_ucr_status        ON user_code_reports (status);
CREATE INDEX IF NOT EXISTS idx_ucr_is_deleted    ON user_code_reports (is_deleted);
