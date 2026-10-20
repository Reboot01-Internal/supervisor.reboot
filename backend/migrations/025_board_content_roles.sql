-- Existing content has no talent provenance and remains staff-protected.
ALTER TABLE lists ADD COLUMN created_by_role TEXT NOT NULL DEFAULT '';
ALTER TABLE cards ADD COLUMN created_by_role TEXT NOT NULL DEFAULT '';
