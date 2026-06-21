-- Migration: Partner Ads system — popup, notification, article formats
CREATE TABLE IF NOT EXISTS partner_ads (
  id                    INT AUTO_INCREMENT PRIMARY KEY,
  partner_id            INT NOT NULL,
  ad_format             ENUM('popup', 'notification', 'article') NOT NULL,
  title                 VARCHAR(255) NOT NULL,
  body                  TEXT,
  image_url             VARCHAR(500),
  cta_text              VARCHAR(100) DEFAULT 'ดูเพิ่มเติม',
  link_url              VARCHAR(500),
  display_delay_seconds INT DEFAULT 0,
  is_active             BOOLEAN DEFAULT TRUE,
  start_date            DATE,
  end_date              DATE,
  view_count            INT DEFAULT 0,
  click_count           INT DEFAULT 0,
  dismiss_count         INT DEFAULT 0,
  created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE CASCADE
);

CREATE INDEX idx_partner_ads_format ON partner_ads(ad_format, is_active);
CREATE INDEX idx_partner_ads_dates  ON partner_ads(start_date, end_date);
