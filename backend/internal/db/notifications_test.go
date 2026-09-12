package db

import (
	"database/sql"
	_ "github.com/mattn/go-sqlite3"
	"testing"
)

func TestWorkspaceNotificationsCollapseDeliveries(t *testing.T) {
	conn, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	conn.SetMaxOpenConns(1)
	for _, query := range []string{
		`CREATE TABLE users (id INTEGER PRIMARY KEY, full_name TEXT, nickname TEXT)`,
		`CREATE TABLE app_notifications (id INTEGER PRIMARY KEY, user_id INTEGER, kind TEXT, title TEXT, body TEXT, link TEXT, is_read INTEGER DEFAULT 0, created_at TEXT)`,
	} {
		if _, err := conn.Exec(query); err != nil {
			t.Fatal(err)
		}
	}
	insert := func(user int, body, link, when string) {
		t.Helper()
		if _, err := conn.Exec(`INSERT INTO app_notifications(user_id,kind,title,body,link,created_at) VALUES (?, 'meeting_reminder', 'Starting now', ?, ?, ?)`, user, body, link, when); err != nil {
			t.Fatal(err)
		}
	}
	// One event delivered to more recipients than the feed limit, plus its
	// shorter participant version. Collapse before applying the 200 limit.
	for user := 1; user <= 205; user++ {
		insert(user, "Meeting A in board A", "/notifications", "2026-09-12 16:55:00")
	}
	insert(300, "Meeting A starts now", "/calendar", "2026-09-12 16:55:00")
	insert(1, "Meeting B in board B", "/notifications", "2026-09-12 16:55:00")
	insert(1, "Meeting A in board A", "/notifications", "2026-09-11 16:55:00")
	items, err := ListAllNotifications(conn)
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 3 {
		t.Fatalf("got %d updates, want 3 distinct events", len(items))
	}
	if items[0].Body != "Meeting B in board B" || items[2].CreatedAt != "2026-09-11 16:55:00" {
		t.Fatalf("unexpected order: %+v", items)
	}
	personal, err := ListNotificationsByUser(conn, 300)
	if err != nil {
		t.Fatal(err)
	}
	if len(personal) != 1 || personal[0].Link != "/calendar" {
		t.Fatalf("personal delivery lost: %+v", personal)
	}
	var count int
	if err := conn.QueryRow(`SELECT COUNT(*) FROM app_notifications`).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 208 {
		t.Fatalf("stored deliveries changed: %d", count)
	}
}
