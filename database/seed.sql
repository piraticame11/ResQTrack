USE resqtrack;

-- Puroks 1–14
INSERT IGNORE INTO puroks (id, name) VALUES
  (1,  'Purok 1'),  (2,  'Purok 2'),  (3,  'Purok 3'),  (4,  'Purok 4'),
  (5,  'Purok 5'),  (6,  'Purok 6'),  (7,  'Purok 7'),  (8,  'Purok 8'),
  (9,  'Purok 9'),  (10, 'Purok 10'), (11, 'Purok 11'), (12, 'Purok 12'),
  (13, 'Purok 13'), (14, 'Purok 14');

-- All passwords are: password
-- bcrypt hash: $2b$10$erNRnBDFQ1iCraiqZNB7OuB0xSbQ2FbaRc8U5mLtKnS3/4T7njJ6.

-- Admin accounts
INSERT IGNORE INTO users (full_name, email, password_hash, phone, role, purok_id, is_verified, is_active) VALUES
  ('Barangay Admin',    'admin@resqtrack.ph',       '$2b$10$erNRnBDFQ1iCraiqZNB7OuB0xSbQ2FbaRc8U5mLtKnS3/4T7njJ6.', '09100000001', 'admin',     NULL, 1, 1),
  ('Captain Juan Reyes','captain@resqtrack.ph',     '$2b$10$erNRnBDFQ1iCraiqZNB7OuB0xSbQ2FbaRc8U5mLtKnS3/4T7njJ6.', '09100000002', 'admin',     NULL, 1, 1);

-- Responder / Tanod accounts
INSERT IGNORE INTO users (full_name, email, password_hash, phone, role, purok_id, is_verified, is_active) VALUES
  ('Tanod Pedro Santos',  'pedro@resqtrack.ph',   '$2b$10$erNRnBDFQ1iCraiqZNB7OuB0xSbQ2FbaRc8U5mLtKnS3/4T7njJ6.', '09200000001', 'responder', 1,  1, 1),
  ('Tanod Maria Dela Cruz','maria@resqtrack.ph',  '$2b$10$erNRnBDFQ1iCraiqZNB7OuB0xSbQ2FbaRc8U5mLtKnS3/4T7njJ6.', '09200000002', 'responder', 3,  1, 1),
  ('Tanod Jose Ramos',    'jose@resqtrack.ph',    '$2b$10$erNRnBDFQ1iCraiqZNB7OuB0xSbQ2FbaRc8U5mLtKnS3/4T7njJ6.', '09200000003', 'responder', 5,  1, 1),
  ('Tanod Ana Bautista',  'ana@resqtrack.ph',     '$2b$10$erNRnBDFQ1iCraiqZNB7OuB0xSbQ2FbaRc8U5mLtKnS3/4T7njJ6.', '09200000004', 'responder', 7,  1, 1),
  ('Tanod Carlos Mendoza','carlos@resqtrack.ph',  '$2b$10$erNRnBDFQ1iCraiqZNB7OuB0xSbQ2FbaRc8U5mLtKnS3/4T7njJ6.', '09200000005', 'responder', 9,  1, 1),
  ('Tanod Rosa Garcia',   'rosa@resqtrack.ph',    '$2b$10$erNRnBDFQ1iCraiqZNB7OuB0xSbQ2FbaRc8U5mLtKnS3/4T7njJ6.', '09200000006', 'responder', 11, 1, 1);

-- Resident accounts (verified)
INSERT IGNORE INTO users (full_name, email, password_hash, phone, role, purok_id, is_verified, is_active) VALUES
  ('Juan dela Cruz',     'juan@example.com',    '$2b$10$erNRnBDFQ1iCraiqZNB7OuB0xSbQ2FbaRc8U5mLtKnS3/4T7njJ6.', '09300000001', 'resident', 1,  1, 1),
  ('Maria Santos',       'mariasantos@example.com','$2b$10$erNRnBDFQ1iCraiqZNB7OuB0xSbQ2FbaRc8U5mLtKnS3/4T7njJ6.', '09300000002', 'resident', 2,  1, 1),
  ('Roberto Reyes',      'roberto@example.com', '$2b$10$erNRnBDFQ1iCraiqZNB7OuB0xSbQ2FbaRc8U5mLtKnS3/4T7njJ6.', '09300000003', 'resident', 3,  1, 1),
  ('Ligaya Cruz',        'ligaya@example.com',  '$2b$10$erNRnBDFQ1iCraiqZNB7OuB0xSbQ2FbaRc8U5mLtKnS3/4T7njJ6.', '09300000004', 'resident', 4,  1, 1),
  ('Ernesto Flores',     'ernesto@example.com', '$2b$10$erNRnBDFQ1iCraiqZNB7OuB0xSbQ2FbaRc8U5mLtKnS3/4T7njJ6.', '09300000005', 'resident', 5,  1, 1),
  ('Cynthia Villanueva', 'cynthia@example.com', '$2b$10$erNRnBDFQ1iCraiqZNB7OuB0xSbQ2FbaRc8U5mLtKnS3/4T7njJ6.', '09300000006', 'resident', 6,  1, 1),
  ('Danilo Torres',      'danilo@example.com',  '$2b$10$erNRnBDFQ1iCraiqZNB7OuB0xSbQ2FbaRc8U5mLtKnS3/4T7njJ6.', '09300000007', 'resident', 7,  1, 1),
  ('Nelia Aquino',       'nelia@example.com',   '$2b$10$erNRnBDFQ1iCraiqZNB7OuB0xSbQ2FbaRc8U5mLtKnS3/4T7njJ6.', '09300000008', 'resident', 8,  1, 1);

-- Resident account (unverified — for testing the pending verification flow)
INSERT IGNORE INTO users (full_name, email, password_hash, phone, role, purok_id, is_verified, is_active) VALUES
  ('Pending User',       'pending@example.com', '$2b$10$erNRnBDFQ1iCraiqZNB7OuB0xSbQ2FbaRc8U5mLtKnS3/4T7njJ6.', '09300000099', 'resident', 10, 0, 1);

-- Emergency contacts
INSERT IGNORE INTO emergency_contacts (label, phone) VALUES
  ('National Emergency',      '911'),
  ('PNP Emergency',           '117'),
  ('BFP Fire Hotline',        '160'),
  ('Panabo City Police',      '(084) 823-1656'),
  ('Panabo City Fire',        '(084) 823-1773'),
  ('DSWD Hotline',            '16545');
