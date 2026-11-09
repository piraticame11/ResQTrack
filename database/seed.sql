USE resqtrack;

-- Puroks for Barangay Manay (1–15)
INSERT INTO puroks (id, name, barangay, version) VALUES
  (1,  'Purok 1',  'Barangay Manay', 'manay'), (2,  'Purok 2',  'Barangay Manay', 'manay'),
  (3,  'Purok 3',  'Barangay Manay', 'manay'), (4,  'Purok 4',  'Barangay Manay', 'manay'),
  (5,  'Purok 5',  'Barangay Manay', 'manay'), (6,  'Purok 6',  'Barangay Manay', 'manay'),
  (7,  'Purok 7',  'Barangay Manay', 'manay'), (8,  'Purok 8',  'Barangay Manay', 'manay'),
  (9,  'Purok 9',  'Barangay Manay', 'manay'), (10, 'Purok 10', 'Barangay Manay', 'manay'),
  (11, 'Purok 11', 'Barangay Manay', 'manay'), (12, 'Purok 12', 'Barangay Manay', 'manay'),
  (13, 'Purok 13', 'Barangay Manay', 'manay'), (14, 'Purok 14', 'Barangay Manay', 'manay'),
  (15, 'Purok 15', 'Barangay Manay', 'manay')
ON DUPLICATE KEY UPDATE version = VALUES(version), barangay = VALUES(barangay);

-- Puroks for Barangay New Visayas (16–30)
INSERT INTO puroks (id, name, barangay, version) VALUES
  (16, 'Purok 1',  'Barangay New Visayas', 'new-visayas'), (17, 'Purok 2',  'Barangay New Visayas', 'new-visayas'),
  (18, 'Purok 3',  'Barangay New Visayas', 'new-visayas'), (19, 'Purok 4',  'Barangay New Visayas', 'new-visayas'),
  (20, 'Purok 5',  'Barangay New Visayas', 'new-visayas'), (21, 'Purok 6',  'Barangay New Visayas', 'new-visayas'),
  (22, 'Purok 7',  'Barangay New Visayas', 'new-visayas'), (23, 'Purok 8',  'Barangay New Visayas', 'new-visayas'),
  (24, 'Purok 9',  'Barangay New Visayas', 'new-visayas'), (25, 'Purok 10', 'Barangay New Visayas', 'new-visayas'),
  (26, 'Purok 11', 'Barangay New Visayas', 'new-visayas'), (27, 'Purok 12', 'Barangay New Visayas', 'new-visayas'),
  (28, 'Purok 13', 'Barangay New Visayas', 'new-visayas'), (29, 'Purok 14', 'Barangay New Visayas', 'new-visayas'),
  (30, 'Purok 15', 'Barangay New Visayas', 'new-visayas')
ON DUPLICATE KEY UPDATE version = VALUES(version), barangay = VALUES(barangay);

-- All passwords are: password
-- bcrypt hash: $2b$10$erNRnBDFQ1iCraiqZNB7OuB0xSbQ2FbaRc8U5mLtKnS3/4T7njJ6.

-- ══════════════════════════════════════════════════════════════
-- BARANGAY MANAY SEED DATA
-- ══════════════════════════════════════════════════════════════

-- Admin accounts (Manay)
INSERT IGNORE INTO users (full_name, email, password_hash, phone, role, purok_id, is_verified, is_active, version) VALUES
  ('Barangay Admin',    'admin@resqtrack.ph',       '$2b$10$erNRnBDFQ1iCraiqZNB7OuB0xSbQ2FbaRc8U5mLtKnS3/4T7njJ6.', '09100000001', 'admin',       NULL, 1, 1, 'manay'),
  ('Captain Juan Reyes','captain@resqtrack.ph',     '$2b$10$erNRnBDFQ1iCraiqZNB7OuB0xSbQ2FbaRc8U5mLtKnS3/4T7njJ6.', '09100000002', 'admin',     NULL, 1, 1, 'manay');

-- Responder / Tanod accounts (Manay)
INSERT IGNORE INTO users (full_name, email, password_hash, phone, role, purok_id, is_verified, is_active, version) VALUES
  ('Tanod Pedro Santos',  'pedro@resqtrack.ph',   '$2b$10$erNRnBDFQ1iCraiqZNB7OuB0xSbQ2FbaRc8U5mLtKnS3/4T7njJ6.', '09200000001', 'responder', 1,  1, 1, 'manay'),
  ('Tanod Maria Dela Cruz','maria@resqtrack.ph',  '$2b$10$erNRnBDFQ1iCraiqZNB7OuB0xSbQ2FbaRc8U5mLtKnS3/4T7njJ6.', '09200000002', 'responder', 3,  1, 1, 'manay'),
  ('Tanod Jose Ramos',    'jose@resqtrack.ph',    '$2b$10$erNRnBDFQ1iCraiqZNB7OuB0xSbQ2FbaRc8U5mLtKnS3/4T7njJ6.', '09200000003', 'responder', 5,  1, 1, 'manay'),
  ('Tanod Ana Bautista',  'ana@resqtrack.ph',     '$2b$10$erNRnBDFQ1iCraiqZNB7OuB0xSbQ2FbaRc8U5mLtKnS3/4T7njJ6.', '09200000004', 'responder', 7,  1, 1, 'manay'),
  ('Tanod Carlos Mendoza','carlos@resqtrack.ph',  '$2b$10$erNRnBDFQ1iCraiqZNB7OuB0xSbQ2FbaRc8U5mLtKnS3/4T7njJ6.', '09200000005', 'responder', 9,  1, 1, 'manay'),
  ('Tanod Rosa Garcia',   'rosa@resqtrack.ph',    '$2b$10$erNRnBDFQ1iCraiqZNB7OuB0xSbQ2FbaRc8U5mLtKnS3/4T7njJ6.', '09200000006', 'responder', 11, 1, 1, 'manay');

-- Resident accounts (Manay - verified)
INSERT IGNORE INTO users (full_name, email, password_hash, phone, role, purok_id, is_verified, is_active, version) VALUES
  ('Juan dela Cruz',     'juan@example.com',    '$2b$10$erNRnBDFQ1iCraiqZNB7OuB0xSbQ2FbaRc8U5mLtKnS3/4T7njJ6.', '09300000001', 'resident', 1,  1, 1, 'manay'),
  ('Maria Santos',       'mariasantos@example.com','$2b$10$erNRnBDFQ1iCraiqZNB7OuB0xSbQ2FbaRc8U5mLtKnS3/4T7njJ6.', '09300000002', 'resident', 2,  1, 1, 'manay'),
  ('Roberto Reyes',      'roberto@example.com', '$2b$10$erNRnBDFQ1iCraiqZNB7OuB0xSbQ2FbaRc8U5mLtKnS3/4T7njJ6.', '09300000003', 'resident', 3,  1, 1, 'manay'),
  ('Ligaya Cruz',        'ligaya@example.com',  '$2b$10$erNRnBDFQ1iCraiqZNB7OuB0xSbQ2FbaRc8U5mLtKnS3/4T7njJ6.', '09300000004', 'resident', 4,  1, 1, 'manay'),
  ('Ernesto Flores',     'ernesto@example.com', '$2b$10$erNRnBDFQ1iCraiqZNB7OuB0xSbQ2FbaRc8U5mLtKnS3/4T7njJ6.', '09300000005', 'resident', 5,  1, 1, 'manay'),
  ('Cynthia Villanueva', 'cynthia@example.com', '$2b$10$erNRnBDFQ1iCraiqZNB7OuB0xSbQ2FbaRc8U5mLtKnS3/4T7njJ6.', '09300000006', 'resident', 6,  1, 1, 'manay'),
  ('Danilo Torres',      'danilo@example.com',  '$2b$10$erNRnBDFQ1iCraiqZNB7OuB0xSbQ2FbaRc8U5mLtKnS3/4T7njJ6.', '09300000007', 'resident', 7,  1, 1, 'manay'),
  ('Nelia Aquino',       'nelia@example.com',   '$2b$10$erNRnBDFQ1iCraiqZNB7OuB0xSbQ2FbaRc8U5mLtKnS3/4T7njJ6.', '09300000008', 'resident', 8,  1, 1, 'manay');

-- Resident account (Manay - unverified)
INSERT IGNORE INTO users (full_name, email, password_hash, phone, role, purok_id, is_verified, is_active, version) VALUES
  ('Pending User',       'pending@example.com', '$2b$10$erNRnBDFQ1iCraiqZNB7OuB0xSbQ2FbaRc8U5mLtKnS3/4T7njJ6.', '09300000099', 'resident', 10, 0, 1, 'manay');

-- Emergency contacts (Manay)
INSERT IGNORE INTO emergency_contacts (label, phone, version) VALUES
  ('National Emergency',      '911',            'manay'),
  ('PNP Emergency',           '117',            'manay'),
  ('BFP Fire Hotline',        '160',            'manay'),
  ('Panabo City Police',      '(084) 823-1656', 'manay'),
  ('Panabo City Fire',        '(084) 823-1773', 'manay'),
  ('DSWD Hotline',            '16545',          'manay');

-- ══════════════════════════════════════════════════════════════
-- BARANGAY NEW VISAYAS SEED DATA
-- ══════════════════════════════════════════════════════════════

-- Admin accounts (New Visayas)
INSERT IGNORE INTO users (full_name, email, password_hash, phone, role, purok_id, is_verified, is_active, version) VALUES
  ('New Visayas Admin',    'admin.nv@resqtrack.ph',   '$2b$10$erNRnBDFQ1iCraiqZNB7OuB0xSbQ2FbaRc8U5mLtKnS3/4T7njJ6.', '09100000011', 'admin',   NULL, 1, 1, 'new-visayas'),
  ('Captain Pedro Visayas','captain.nv@resqtrack.ph', '$2b$10$erNRnBDFQ1iCraiqZNB7OuB0xSbQ2FbaRc8U5mLtKnS3/4T7njJ6.', '09100000012', 'admin', NULL, 1, 1, 'new-visayas');

-- Responder / Tanod accounts (New Visayas)
INSERT IGNORE INTO users (full_name, email, password_hash, phone, role, purok_id, is_verified, is_active, version) VALUES
  ('Tanod Mario Santos',    'mario.nv@resqtrack.ph',    '$2b$10$erNRnBDFQ1iCraiqZNB7OuB0xSbQ2FbaRc8U5mLtKnS3/4T7njJ6.', '09200000011', 'responder', 16, 1, 1, 'new-visayas'),
  ('Tanod Teresa Gomez',    'teresa.nv@resqtrack.ph',   '$2b$10$erNRnBDFQ1iCraiqZNB7OuB0xSbQ2FbaRc8U5mLtKnS3/4T7njJ6.', '09200000012', 'responder', 18, 1, 1, 'new-visayas'),
  ('Tanod Fernando Lopez',  'fernando.nv@resqtrack.ph', '$2b$10$erNRnBDFQ1iCraiqZNB7OuB0xSbQ2FbaRc8U5mLtKnS3/4T7njJ6.', '09200000013', 'responder', 20, 1, 1, 'new-visayas');

-- Resident accounts (New Visayas - verified)
INSERT IGNORE INTO users (full_name, email, password_hash, phone, role, purok_id, is_verified, is_active, version) VALUES
  ('Ramon Magsaysay',   'ramon.nv@example.com', '$2b$10$erNRnBDFQ1iCraiqZNB7OuB0xSbQ2FbaRc8U5mLtKnS3/4T7njJ6.', '09300000011', 'resident', 16, 1, 1, 'new-visayas'),
  ('Corazon Aquino',    'cory.nv@example.com',  '$2b$10$erNRnBDFQ1iCraiqZNB7OuB0xSbQ2FbaRc8U5mLtKnS3/4T7njJ6.', '09300000012', 'resident', 17, 1, 1, 'new-visayas'),
  ('Josefa Llanes Escoda','josefa.nv@example.com','$2b$10$erNRnBDFQ1iCraiqZNB7OuB0xSbQ2FbaRc8U5mLtKnS3/4T7njJ6.', '09300000013', 'resident', 18, 1, 1, 'new-visayas');

-- Resident account (New Visayas - unverified)
INSERT IGNORE INTO users (full_name, email, password_hash, phone, role, purok_id, is_verified, is_active, version) VALUES
  ('Pending User NV',   'pending.nv@example.com','$2b$10$erNRnBDFQ1iCraiqZNB7OuB0xSbQ2FbaRc8U5mLtKnS3/4T7njJ6.', '09300000098', 'resident', 19, 0, 1, 'new-visayas');

-- Emergency contacts (New Visayas)
INSERT IGNORE INTO emergency_contacts (label, phone, version) VALUES
  ('National Emergency',      '911',            'new-visayas'),
  ('PNP Emergency',           '117',            'new-visayas'),
  ('BFP Fire Hotline',        '160',            'new-visayas'),
  ('Panabo City Police',      '(084) 823-1656', 'new-visayas'),
  ('Panabo City Fire',        '(084) 823-1773', 'new-visayas'),
  ('DSWD Hotline',            '16545',          'new-visayas');
