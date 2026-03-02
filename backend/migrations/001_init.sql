PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin','supervisor','student')),
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- auto "file" per supervisor (created when supervisor is created)
CREATE TABLE IF NOT EXISTS supervisor_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supervisor_user_id INTEGER NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (supervisor_user_id) REFERENCES users(id) ON DELETE CASCADE
);
-- Seed admin (password = Admin123! ) - change later
-- We'll insert from Go on first run instead (safer), so nothing here for now.
-- Boards inside a supervisor file
CREATE TABLE IF NOT EXISTS boards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supervisor_file_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_by INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (supervisor_file_id) REFERENCES supervisor_files(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
);

-- Members of a board (admin/supervisor/student)
CREATE TABLE IF NOT EXISTS board_members (
  board_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  role_in_board TEXT NOT NULL DEFAULT 'member',
  added_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (board_id, user_id),
  FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
-- Lists (columns) inside a board
CREATE TABLE IF NOT EXISTS lists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  board_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE
);

-- Cards inside a list
CREATE TABLE IF NOT EXISTS cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  list_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (list_id) REFERENCES lists(id) ON DELETE CASCADE
);
-- Due date for cards
-- ALTER TABLE cards ADD COLUMN due_date TEXT;

-- Subtasks (checklist items) inside a card
CREATE TABLE IF NOT EXISTS card_subtasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  is_done INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  
  FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE
);

-- Assign users to a card (students/supervisors/admin if you want)
CREATE TABLE IF NOT EXISTS card_assignments (
  card_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  assigned_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (card_id, user_id),
  FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);