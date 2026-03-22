ALTER TABLE meetings ADD COLUMN status TEXT NOT NULL DEFAULT 'scheduled';
ALTER TABLE meetings ADD COLUMN outcome_notes TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS meeting_participants (
  meeting_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  rsvp_status TEXT NOT NULL DEFAULT 'pending',
  attendance_status TEXT NOT NULL DEFAULT 'pending',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (meeting_id, user_id),
  FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
