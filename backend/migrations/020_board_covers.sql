CREATE TABLE IF NOT EXISTS board_covers (
    board_id INTEGER PRIMARY KEY REFERENCES boards(id) ON DELETE CASCADE,
    image BLOB NOT NULL,
    mime_type TEXT NOT NULL,
    version TEXT NOT NULL
);
