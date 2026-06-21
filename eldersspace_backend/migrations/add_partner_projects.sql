-- Migration: Add partner_projects table for CSR / social programs

CREATE TABLE IF NOT EXISTS partner_projects (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  partner_id  INT NOT NULL,
  title       VARCHAR(255) NOT NULL,
  image_url   VARCHAR(500),
  description TEXT,
  link_url    VARCHAR(500),
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE CASCADE
);

CREATE INDEX idx_partner_projects_active ON partner_projects(partner_id, is_active);
