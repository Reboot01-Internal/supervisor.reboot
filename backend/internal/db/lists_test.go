package db

import (
	"database/sql"
	_ "github.com/mattn/go-sqlite3"
	"os"
	"testing"
)

func TestListColorPersistence(t *testing.T) {
	conn, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	_, err = conn.Exec(`CREATE TABLE lists(id INTEGER PRIMARY KEY, board_id INTEGER, title TEXT, position INTEGER, created_at TEXT); INSERT INTO lists VALUES(1,2,'Sessions',0,'2026-09-19')`)
	if err != nil {
		t.Fatal(err)
	}
	migration, err := os.ReadFile("../../migrations/018_list_colors.sql")
	if err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 2; i++ {
		if _, err = conn.Exec(string(migration)); err != nil {
			t.Fatal(err)
		}
	}
	color := "#8ac5ac"
	if err = UpdateListAppearance(conn, 1, "", &color); err != nil {
		t.Fatal(err)
	}
	if err = UpdateListAppearance(conn, 1, "Meetings", nil); err != nil {
		t.Fatal(err)
	}
	lists, err := ListLists(conn, 2)
	if err != nil {
		t.Fatal(err)
	}
	if len(lists) != 1 || lists[0].Color != color || lists[0].Title != "Meetings" {
		t.Fatalf("unexpected lists: %+v", lists)
	}
	color = ""
	if err = UpdateListAppearance(conn, 1, "", &color); err != nil {
		t.Fatal(err)
	}
	lists, err = ListLists(conn, 2)
	if err != nil || lists[0].Color != "" {
		t.Fatalf("reset: %+v %v", lists, err)
	}
}
