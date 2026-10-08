CREATE TABLE IF NOT EXISTS piscine_report_exclusions (
 student_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 month TEXT NOT NULL,
 marked_by INTEGER NOT NULL REFERENCES users(id),
 marked_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
 PRIMARY KEY (student_user_id, month)
);
