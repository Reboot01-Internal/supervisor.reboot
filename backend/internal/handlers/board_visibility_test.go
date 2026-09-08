package handlers

import (
	"database/sql"
	"encoding/json"
	_ "github.com/mattn/go-sqlite3"
	"net/http/httptest"
	"taskflow/internal/db"
	"testing"
)

func TestSupervisorBoardVisibility(t *testing.T) {
	conn, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	conn.SetMaxOpenConns(1)
	_, err = conn.Exec(`
 CREATE TABLE users (id INTEGER, full_name TEXT);
 CREATE TABLE supervisor_files (id INTEGER, supervisor_user_id INTEGER);
 CREATE TABLE boards (id INTEGER, supervisor_file_id INTEGER, name TEXT, description TEXT, status TEXT, inactive_at TEXT, created_at TEXT);
 CREATE TABLE board_members (board_id INTEGER, user_id INTEGER);
 CREATE TABLE lists (id INTEGER, board_id INTEGER);
 CREATE TABLE cards (id INTEGER, list_id INTEGER);
 INSERT INTO users VALUES (1, 'ak1'), (2, 'Other');
 INSERT INTO supervisor_files VALUES (1, 1), (2, 2);
 INSERT INTO boards VALUES (10, 1, 'Owned', '', 'active', '', ''), (20, 2, 'Shared', '', 'active', '', ''), (30, 2, 'Private', '', 'active', '', '');
 INSERT INTO board_members VALUES (10, 1), (20, 1);
 `)
	if err != nil {
		t.Fatal(err)
	}
	api := &API{conn: conn}
	for _, shared := range []bool{true, false} {
		if !shared {
			if _, err := conn.Exec(`DELETE FROM board_members WHERE board_id = 20`); err != nil {
				t.Fatal(err)
			}
		}
		req := httptest.NewRequest("GET", "/admin/boards", nil)
		req.Header.Set("X-User-Role", "supervisor")
		response := httptest.NewRecorder()
		api.AdminAllBoards(response, req)
		if response.Code != 200 {
			t.Fatalf("list: %d %s", response.Code, response.Body.String())
		}
		var boards []struct {
			ID int64 `json:"id"`
		}
		if err := json.Unmarshal(response.Body.Bytes(), &boards); err != nil {
			t.Fatal(err)
		}
		expected := 1
		if shared {
			expected++
		}
		if len(boards) != expected {
			t.Fatalf("unexpected boards: %+v", boards)
		}
		for _, board := range boards {
			if board.ID != 10 && (board.ID != 20 || !shared) {
				t.Fatalf("unauthorized board: %d", board.ID)
			}
		}
		for id, want := range map[int64]bool{10: true, 20: shared, 30: false, 999: false} {
			allowed, err := db.CanViewBoard(conn, id, 1)
			if err != nil || allowed != want {
				t.Fatalf("board %d: allowed=%v err=%v", id, allowed, err)
			}
		}
	}
}
