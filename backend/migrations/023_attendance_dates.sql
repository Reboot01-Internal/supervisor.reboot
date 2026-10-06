CREATE TABLE IF NOT EXISTS attendance_dates (
 member_id INTEGER NOT NULL REFERENCES attendance_members(id),
 date TEXT NOT NULL,
 required_minutes INTEGER NOT NULL CHECK(required_minutes BETWEEN 1 AND 1440),
 updated_at TEXT NOT NULL DEFAULT (datetime('now')),
 PRIMARY KEY(member_id,date)
);
CREATE TABLE IF NOT EXISTS attendance_date_alerts (
 member_id INTEGER NOT NULL, date TEXT NOT NULL, status TEXT NOT NULL,
 PRIMARY KEY(member_id,date,status)
);
