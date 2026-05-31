USE resqtrack;

CREATE TABLE IF NOT EXISTS incident_responders (
  id           INT       PRIMARY KEY AUTO_INCREMENT,
  incident_id  INT       NOT NULL,
  responder_id INT       NOT NULL,
  assigned_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_assignment (incident_id, responder_id),
  FOREIGN KEY (incident_id)  REFERENCES incidents(id) ON DELETE CASCADE,
  FOREIGN KEY (responder_id) REFERENCES users(id)     ON DELETE CASCADE
);
