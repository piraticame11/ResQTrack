-- Add birthdate and id_image to existing users table
-- Run this once if your database was already set up before this update

USE resqtrack;

-- Add birthdate column (skip if already exists)
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'birthdate'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE users ADD COLUMN birthdate DATE DEFAULT NULL AFTER phone',
  'SELECT "birthdate column already exists" AS info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Add id_image column (skip if already exists)
SET @col_exists2 = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id_image'
);
SET @sql2 = IF(@col_exists2 = 0,
  'ALTER TABLE users ADD COLUMN id_image VARCHAR(255) DEFAULT NULL AFTER profile_photo',
  'SELECT "id_image column already exists" AS info'
);
PREPARE stmt2 FROM @sql2; EXECUTE stmt2; DEALLOCATE PREPARE stmt2;
