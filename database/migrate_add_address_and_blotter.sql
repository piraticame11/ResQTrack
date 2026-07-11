-- Add exact address / residency / verification-status fields to users,
-- and add the blotter_entries + blotter_logs tables.
-- Run this once if your database was already set up before this update.
-- (npm run migrate applies the same changes automatically.)

USE resqtrack;

-- address_line
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'address_line'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE users ADD COLUMN address_line VARCHAR(255) DEFAULT NULL AFTER purok_id',
  'SELECT "address_line column already exists" AS info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- residency_type
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'residency_type'
);
SET @sql = IF(@col_exists = 0,
  "ALTER TABLE users ADD COLUMN residency_type ENUM('Owner','Tenant') NOT NULL DEFAULT 'Owner' AFTER address_line",
  'SELECT "residency_type column already exists" AS info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- landlord_name
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'landlord_name'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE users ADD COLUMN landlord_name VARCHAR(150) DEFAULT NULL AFTER residency_type',
  'SELECT "landlord_name column already exists" AS info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- landlord_contact
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'landlord_contact'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE users ADD COLUMN landlord_contact VARCHAR(20) DEFAULT NULL AFTER landlord_name',
  'SELECT "landlord_contact column already exists" AS info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- verification_status
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'verification_status'
);
SET @sql = IF(@col_exists = 0,
  "ALTER TABLE users ADD COLUMN verification_status ENUM('Pending','Verified','Rejected') NOT NULL DEFAULT 'Pending' AFTER is_verified",
  'SELECT "verification_status column already exists" AS info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- verification_note
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'verification_note'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE users ADD COLUMN verification_note VARCHAR(255) DEFAULT NULL AFTER verification_status',
  'SELECT "verification_note column already exists" AS info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Backfill: users already verified under the old boolean flag
UPDATE users SET verification_status = 'Verified'
WHERE is_verified = 1 AND verification_status = 'Pending';

-- Digital Blotter tables
CREATE TABLE IF NOT EXISTS blotter_entries (
  id                   INT           PRIMARY KEY AUTO_INCREMENT,
  entry_no             VARCHAR(30)   NOT NULL UNIQUE,
  incident_id          INT           DEFAULT NULL,
  complainant_name     VARCHAR(150)  NOT NULL,
  complainant_address  VARCHAR(255)  DEFAULT NULL,
  complainant_contact  VARCHAR(20)   DEFAULT NULL,
  respondent_name      VARCHAR(150)  NOT NULL,
  respondent_address   VARCHAR(255)  DEFAULT NULL,
  respondent_contact   VARCHAR(20)   DEFAULT NULL,
  nature               VARCHAR(150)  NOT NULL,
  narrative            TEXT          NOT NULL,
  action_taken         TEXT          DEFAULT NULL,
  purok_id             INT           DEFAULT NULL,
  status               ENUM('Open','Under Mediation','Resolved','Endorsed to Court','Voided') NOT NULL DEFAULT 'Open',
  filed_by             INT           NOT NULL,
  is_locked            TINYINT(1)    NOT NULL DEFAULT 0,
  filed_at             TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at          TIMESTAMP     NULL DEFAULT NULL,
  FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE SET NULL,
  FOREIGN KEY (purok_id)    REFERENCES puroks(id)    ON DELETE SET NULL,
  FOREIGN KEY (filed_by)    REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS blotter_logs (
  id          INT          PRIMARY KEY AUTO_INCREMENT,
  blotter_id  INT          NOT NULL,
  actor_id    INT          DEFAULT NULL,
  action      VARCHAR(150) NOT NULL,
  note        TEXT         DEFAULT NULL,
  logged_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (blotter_id) REFERENCES blotter_entries(id) ON DELETE CASCADE,
  FOREIGN KEY (actor_id)   REFERENCES users(id) ON DELETE SET NULL
);
