-- Migration: เพิ่มระบบ Partner และ Home Banners
-- สร้างตาราง partners, partner_jobs, partner_services, home_banners

CREATE TABLE IF NOT EXISTS partners (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  name            VARCHAR(255) NOT NULL,
  logo_url        VARCHAR(500),
  cover_image_url VARCHAR(500),
  tagline         VARCHAR(500),
  description     TEXT,
  category        VARCHAR(100),
  website_url     VARCHAR(500),
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS partner_jobs (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  partner_id   INT NOT NULL,
  title        VARCHAR(255) NOT NULL,
  job_type     VARCHAR(100),
  location     VARCHAR(255),
  salary_range VARCHAR(100),
  description  TEXT,
  is_active    BOOLEAN DEFAULT TRUE,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS partner_services (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  partner_id    INT NOT NULL,
  title         VARCHAR(255) NOT NULL,
  image_url     VARCHAR(500),
  description   TEXT,
  display_order INT DEFAULT 0,
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE CASCADE
);

-- banner_type: benefits=สิทธิประโยชน์, announcement=ประกาศสัมพันธ์, special_offer=โปรโมชั่นเด่น, sponsor=ผู้สนับสนุน, general=ทั่วไป
CREATE TABLE IF NOT EXISTS home_banners (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  partner_id    INT,
  title         VARCHAR(255),
  description   TEXT,
  image_url     VARCHAR(500),
  link_url      VARCHAR(500),
  banner_type   ENUM('benefits','announcement','special_offer','sponsor','general') DEFAULT 'general',
  display_order INT DEFAULT 0,
  is_active     BOOLEAN DEFAULT TRUE,
  start_date    DATE,
  end_date      DATE,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE SET NULL
);

CREATE INDEX idx_partners_active       ON partners(is_active);
CREATE INDEX idx_partner_jobs_active   ON partner_jobs(partner_id, is_active);
CREATE INDEX idx_home_banners_type     ON home_banners(banner_type, is_active);
CREATE INDEX idx_home_banners_dates    ON home_banners(start_date, end_date);
