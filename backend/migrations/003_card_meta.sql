-- migrations/003_card_meta.sql
PRAGMA foreign_keys = ON;

-- Card meta (status/priority)
ALTER TABLE cards ADD COLUMN status TEXT NOT NULL DEFAULT 'todo'
  CHECK(status IN ('todo','doing','blocked','done'));

ALTER TABLE cards ADD COLUMN priority TEXT NOT NULL DEFAULT 'medium'
  CHECK(priority IN ('low','medium','high','urgent'));

-- Labels per board
CREATE TABLE IF NOT EXISTS labels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  board_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT 'indigo', -- simple token name for UI
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_labels_board_name
ON labels(board_id, LOWER(name));

-- Card <-> Labels
CREATE TABLE IF NOT EXISTS card_labels (
  card_id INTEGER NOT NULL,
  label_id INTEGER NOT NULL,
  added_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (card_id, label_id),
  FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE,
  FOREIGN KEY (label_id) REFERENCES labels(id) ON DELETE CASCADE
);