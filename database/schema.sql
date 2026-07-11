CREATE DATABASE IF NOT EXISTS resqtrack CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE resqtrack;

CREATE TABLE IF NOT EXISTS puroks (
  id   INT PRIMARY KEY,
  name VARCHAR(50)  NOT NULL,
  barangay VARCHAR(100) NOT NULL DEFAULT 'Barangay Manay'
);

CREATE TABLE IF NOT EXISTS users (
  id            INT          PRIMARY KEY AUTO_INCREMENT,
  full_name     VARCHAR(150) NOT NULL,
  email         VARCHAR(150) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  phone         VARCHAR(20)  DEFAULT NULL,
  birthdate     DATE         DEFAULT NULL,
  role          ENUM('admin','responder','resident') NOT NULL DEFAULT 'resident',
  purok_id      INT          DEFAULT NULL,
  address_line  VARCHAR(255) DEFAULT NULL,
  residency_type      ENUM('Owner','Tenant') NOT NULL DEFAULT 'Owner',
  landlord_name       VARCHAR(150) DEFAULT NULL,
  landlord_contact    VARCHAR(20)  DEFAULT NULL,
  profile_photo VARCHAR(255) DEFAULT NULL,
  id_image      VARCHAR(255) DEFAULT NULL,
  is_verified   TINYINT(1)   NOT NULL DEFAULT 0,
  verification_status ENUM('Pending','Verified','Rejected') NOT NULL DEFAULT 'Pending',
  verification_note   VARCHAR(255) DEFAULT NULL,
  is_active     TINYINT(1)   NOT NULL DEFAULT 1,
  fake_report_count INT      NOT NULL DEFAULT 0,
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (purok_id) REFERENCES puroks(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS incidents (
  id                    INT           PRIMARY KEY AUTO_INCREMENT,
  reference_no          VARCHAR(30)   NOT NULL UNIQUE,
  reporter_id           INT           NOT NULL,
  incident_type         ENUM('Fire','Rescue','Crime','Noise','Garbage','Other') NOT NULL,
  description           TEXT          NOT NULL,
  purok_id              INT           DEFAULT NULL,
  latitude              DECIMAL(10,8) DEFAULT NULL,
  longitude             DECIMAL(11,8) DEFAULT NULL,
  photo_path            VARCHAR(255)  DEFAULT NULL,
  status                ENUM('Pending','Dispatched','Initiate','Delayed','Resolved','Archived') NOT NULL DEFAULT 'Pending',
  triage_color          ENUM('Red','Orange','Yellow','Green') NOT NULL DEFAULT 'Yellow',
  assigned_responder_id INT           DEFAULT NULL,
  is_fake               TINYINT(1)    NOT NULL DEFAULT 0,
  fake_reason           TEXT          DEFAULT NULL,
  flagged_by            INT           DEFAULT NULL,
  flagged_at            TIMESTAMP     NULL DEFAULT NULL,
  reported_at           TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at           TIMESTAMP     NULL DEFAULT NULL,
  archived_at           TIMESTAMP     NULL DEFAULT NULL,
  FOREIGN KEY (reporter_id)           REFERENCES users(id),
  FOREIGN KEY (purok_id)              REFERENCES puroks(id) ON DELETE SET NULL,
  FOREIGN KEY (assigned_responder_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (flagged_by)            REFERENCES users(id) ON DELETE SET NULL
);

-- Multiple evidence photos per incident (camera or gallery). photo_path on
-- incidents keeps the first photo for backward compatibility with older UI.
CREATE TABLE IF NOT EXISTS incident_attachments (
  id          INT       PRIMARY KEY AUTO_INCREMENT,
  incident_id INT       NOT NULL,
  file_path   VARCHAR(255) NOT NULL,
  uploaded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS incident_responders (
  id           INT       PRIMARY KEY AUTO_INCREMENT,
  incident_id  INT       NOT NULL,
  responder_id INT       NOT NULL,
  assigned_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_assignment (incident_id, responder_id),
  FOREIGN KEY (incident_id)  REFERENCES incidents(id) ON DELETE CASCADE,
  FOREIGN KEY (responder_id) REFERENCES users(id)     ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS incident_logs (
  id          INT          PRIMARY KEY AUTO_INCREMENT,
  incident_id INT          NOT NULL,
  actor_id    INT          DEFAULT NULL,
  action      VARCHAR(150) NOT NULL,
  note        TEXT         DEFAULT NULL,
  logged_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE,
  FOREIGN KEY (actor_id)    REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS responder_locations (
  id           INT           PRIMARY KEY AUTO_INCREMENT,
  responder_id INT           NOT NULL,
  latitude     DECIMAL(10,8) NOT NULL,
  longitude    DECIMAL(11,8) NOT NULL,
  updated_at   TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_responder (responder_id),
  FOREIGN KEY (responder_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS announcements (
  id           INT       PRIMARY KEY AUTO_INCREMENT,
  admin_id     INT       NOT NULL,
  title        VARCHAR(255) NOT NULL,
  body         TEXT         NOT NULL,
  is_published TINYINT(1)   NOT NULL DEFAULT 0,
  scheduled_at TIMESTAMP    NULL DEFAULT NULL,
  published_at TIMESTAMP    NULL DEFAULT NULL,
  created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (admin_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS emergency_contacts (
  id         INT          PRIMARY KEY AUTO_INCREMENT,
  label      VARCHAR(100) NOT NULL,
  phone      VARCHAR(20)  NOT NULL,
  updated_by INT          DEFAULT NULL,
  updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Digital Blotter: formal complaint/dispute records filed by barangay staff,
-- distinct from resident-submitted incident reports.
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

-- Immutable audit trail for blotter entries — every create/edit/status change
-- is recorded here and nothing in this table is ever updated or deleted,
-- so a locked entry's history can't be quietly rewritten.
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

-- System-wide audit trail: logins, logouts, and admin account-management
-- actions. Incident and blotter actions have their own dedicated logs
-- (incident_logs, blotter_logs) — this table covers what those don't.
CREATE TABLE IF NOT EXISTS audit_logs (
  id          INT          PRIMARY KEY AUTO_INCREMENT,
  actor_id    INT          DEFAULT NULL,
  actor_name  VARCHAR(150) DEFAULT NULL,
  action      VARCHAR(150) NOT NULL,
  details     TEXT         DEFAULT NULL,
  ip_address  VARCHAR(45)  DEFAULT NULL,
  logged_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL
);
