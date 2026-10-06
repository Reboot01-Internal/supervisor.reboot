CREATE TABLE IF NOT EXISTS attendance_requirements (
 member_id INTEGER PRIMARY KEY REFERENCES attendance_members(id),
 period TEXT NOT NULL CHECK(period IN ('week','month')),
 required_days INTEGER NOT NULL CHECK(required_days BETWEEN 1 AND 31),
 required_minutes INTEGER NOT NULL CHECK(required_minutes BETWEEN 1 AND 44640),
 updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
