-- Migration: Add view_count and click_count tracking to home_banners

ALTER TABLE home_banners
  ADD COLUMN view_count  INT DEFAULT 0,
  ADD COLUMN click_count INT DEFAULT 0;
