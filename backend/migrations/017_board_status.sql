ALTER TABLE boards ADD COLUMN status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive'));
ALTER TABLE boards ADD COLUMN inactive_at TEXT NOT NULL DEFAULT '';
