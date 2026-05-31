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
  role          ENUM('admin','responder','resident') NOT NULL DEFAULT 'resident',
  purok_id      INT          DEFAULT NULL,
  profile_photo VARCHAR(255) DEFAULT NULL,
  is_verified   TINYINT(1)   NOT NULL DEFAULT 0,
  is_active     TINYINT(1)   NOT NULL DEFAULT 1,
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (purok_id) REFERENCES puroks(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS incidents (
  id                    INT           PRIMARY KEY AUTO_INCREMENT,
  reference_no          VARCHAR(30)   NOT NULL UNIQUE,
  reporter_id           INT           NOT NULL,
  incident_type         ENUM('Fire','Medical','Crime','Noise','Garbage','Other') NOT NULL,
  description           TEXT          NOT NULL,
  purok_id              INT           DEFAULT NULL,
  latitude              DECIMAL(10,8) DEFAULT NULL,
  longitude             DECIMAL(11,8) DEFAULT NULL,
  photo_path            VARCHAR(255)  DEFAULT NULL,
  status                ENUM('Pending','Dispatched','Ongoing','Resolved','Archived') NOT NULL DEFAULT 'Pending',
  triage_color          ENUM('Red','Orange','Yellow','Green') NOT NULL DEFAULT 'Yellow',
  assigned_responder_id INT           DEFAULT NULL,
  reported_at           TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at           TIMESTAMP     NULL DEFAULT NULL,
  archived_at           TIMESTAMP     NULL DEFAULT NULL,
  FOREIGN KEY (reporter_id)           REFERENCES users(id),
  FOREIGN KEY (purok_id)              REFERENCES puroks(id) ON DELETE SET NULL,
  FOREIGN KEY (assigned_responder_id) REFERENCES users(id) ON DELETE SET NULL
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
