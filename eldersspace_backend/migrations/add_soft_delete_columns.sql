-- Migration: Add is_deleted column for soft-delete policy
-- Run once. Re-running will error on duplicate column (safe to ignore).
ALTER TABLE bonus_events ADD COLUMN is_deleted TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE rewards      ADD COLUMN is_deleted TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE promo_codes  ADD COLUMN is_deleted TINYINT(1) NOT NULL DEFAULT 0;

CREATE INDEX idx_bonus_events_is_deleted ON bonus_events(is_deleted);
CREATE INDEX idx_rewards_is_deleted      ON rewards(is_deleted);
CREATE INDEX idx_promo_codes_is_deleted  ON promo_codes(is_deleted);
