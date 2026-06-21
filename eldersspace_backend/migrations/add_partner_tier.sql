ALTER TABLE partners
  ADD COLUMN tier ENUM('none','silver','gold','platinum') NOT NULL DEFAULT 'none';
