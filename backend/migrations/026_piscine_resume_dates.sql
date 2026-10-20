-- Keep the original monthly mark for history, and record when participation ended.
ALTER TABLE piscine_report_exclusions ADD COLUMN resumed_at TEXT NOT NULL DEFAULT '';
