-- Migration to add official blotter form fields to blotter_entries
ALTER TABLE blotter_entries
  ADD COLUMN IF NOT EXISTS complainant_age INT DEFAULT NULL AFTER complainant_contact,
  ADD COLUMN IF NOT EXISTS complainant_sex VARCHAR(10) DEFAULT NULL AFTER complainant_age,
  ADD COLUMN IF NOT EXISTS complainant_occupation VARCHAR(100) DEFAULT NULL AFTER complainant_sex,
  ADD COLUMN IF NOT EXISTS complainant_civil_status VARCHAR(50) DEFAULT NULL AFTER complainant_occupation,
  ADD COLUMN IF NOT EXISTS respondent_age INT DEFAULT NULL AFTER respondent_contact,
  ADD COLUMN IF NOT EXISTS respondent_sex VARCHAR(10) DEFAULT NULL AFTER respondent_age,
  ADD COLUMN IF NOT EXISTS respondent_occupation VARCHAR(100) DEFAULT NULL AFTER respondent_sex,
  ADD COLUMN IF NOT EXISTS respondent_civil_status VARCHAR(50) DEFAULT NULL AFTER respondent_occupation,
  ADD COLUMN IF NOT EXISTS incident_date DATE DEFAULT NULL AFTER respondent_civil_status,
  ADD COLUMN IF NOT EXISTS incident_time VARCHAR(20) DEFAULT NULL AFTER incident_date,
  ADD COLUMN IF NOT EXISTS incident_place VARCHAR(255) DEFAULT NULL AFTER incident_time,
  ADD COLUMN IF NOT EXISTS incident_type VARCHAR(100) DEFAULT NULL AFTER incident_place,
  ADD COLUMN IF NOT EXISTS attachments VARCHAR(255) DEFAULT NULL AFTER action_taken,
  ADD COLUMN IF NOT EXISTS noted_by VARCHAR(150) DEFAULT NULL AFTER filed_by;
