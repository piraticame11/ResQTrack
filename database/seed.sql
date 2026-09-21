USE resqtrack;

-- Puroks for Barangay Manay (1–15)
INSERT IGNORE INTO puroks (id, name, barangay) VALUES
  (1,  'Purok 1',  'Barangay Manay'), (2,  'Purok 2',  'Barangay Manay'),
  (3,  'Purok 3',  'Barangay Manay'), (4,  'Purok 4',  'Barangay Manay'),
  (5,  'Purok 5',  'Barangay Manay'), (6,  'Purok 6',  'Barangay Manay'),
  (7,  'Purok 7',  'Barangay Manay'), (8,  'Purok 8',  'Barangay Manay'),
  (9,  'Purok 9',  'Barangay Manay'), (10, 'Purok 10', 'Barangay Manay'),
  (11, 'Purok 11', 'Barangay Manay'), (12, 'Purok 12', 'Barangay Manay'),
  (13, 'Purok 13', 'Barangay Manay'), (14, 'Purok 14', 'Barangay Manay'),
  (15, 'Purok 15', 'Barangay Manay');

-- Puroks for Barangay New Visayas (16–30)
INSERT IGNORE INTO puroks (id, name, barangay) VALUES
  (16, 'Purok 1',  'Barangay New Visayas'), (17, 'Purok 2',  'Barangay New Visayas'),
  (18, 'Purok 3',  'Barangay New Visayas'), (19, 'Purok 4',  'Barangay New Visayas'),
  (20, 'Purok 5',  'Barangay New Visayas'), (21, 'Purok 6',  'Barangay New Visayas'),
  (22, 'Purok 7',  'Barangay New Visayas'), (23, 'Purok 8',  'Barangay New Visayas'),
  (24, 'Purok 9',  'Barangay New Visayas'), (25, 'Purok 10', 'Barangay New Visayas'),
  (26, 'Purok 11', 'Barangay New Visayas'), (27, 'Purok 12', 'Barangay New Visayas'),
  (28, 'Purok 13', 'Barangay New Visayas'), (29, 'Purok 14', 'Barangay New Visayas'),
  (30, 'Purok 15', 'Barangay New Visayas');

-- All passwords are: password
-- bcrypt hash: $2b$10$erNRnBDFQ1iCraiqZNB7OuB0xSbQ2FbaRc8U5mLtKnS3/4T7njJ6.

-- Admin accounts
INSERT IGNORE INTO users (full_name, email, password_hash, phone, role, purok_id, is_verified, is_active) VALUES
  ('Barangay Admin',    'admin@resqtrack.ph',       '$2b$10$erNRnBDFQ1iCraiqZNB7OuB0xSbQ2FbaRc8U5mLtKnS3/4T7njJ6.', '09100000001', 'admin',       NULL, 1, 1),
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
