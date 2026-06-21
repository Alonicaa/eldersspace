-- Counter columns on articles table
ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS like_count   INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS comment_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS share_count  INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS view_count   INT NOT NULL DEFAULT 0;

-- Per-user likes (toggle)
CREATE TABLE IF NOT EXISTS article_likes (
  like_id    INT AUTO_INCREMENT PRIMARY KEY,
  article_id INT NOT NULL,
  user_id    INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_art_user (article_id, user_id),
  INDEX idx_al_article (article_id),
  CONSTRAINT fk_al_article FOREIGN KEY (article_id) REFERENCES articles(article_id) ON DELETE CASCADE,
  CONSTRAINT fk_al_user    FOREIGN KEY (user_id)    REFERENCES users(user_id)       ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Comments
CREATE TABLE IF NOT EXISTS article_comments (
  comment_id INT AUTO_INCREMENT PRIMARY KEY,
  article_id INT NOT NULL,
  user_id    INT NOT NULL,
  content    TEXT NOT NULL,
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ac_article (article_id),
  CONSTRAINT fk_ac_article FOREIGN KEY (article_id) REFERENCES articles(article_id) ON DELETE CASCADE,
  CONSTRAINT fk_ac_user    FOREIGN KEY (user_id)    REFERENCES users(user_id)       ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
