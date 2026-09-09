package handlers

import (
	"database/sql"
	"encoding/json"
	_ "github.com/mattn/go-sqlite3"
	"net/http/httptest"
	"testing"
)

func TestWorkspaceCalendarAccess(t *testing.T) {
	conn, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	_, err = conn.Exec(`CREATE TABLE users(id INTEGER,full_name TEXT,nickname TEXT,email TEXT); CREATE TABLE supervisor_files(id INTEGER,supervisor_user_id INTEGER); CREATE TABLE boards(id INTEGER,name TEXT,supervisor_file_id INTEGER); CREATE TABLE lists(id INTEGER,board_id INTEGER,title TEXT); CREATE TABLE cards(id INTEGER,list_id INTEGER,title TEXT,due_date TEXT,status TEXT,priority TEXT,position INTEGER); CREATE TABLE board_members(board_id INTEGER,user_id INTEGER); CREATE TABLE card_assignments(card_id INTEGER,user_id INTEGER); CREATE TABLE card_labels(card_id INTEGER,label_id INTEGER); CREATE TABLE labels(id INTEGER,name TEXT,color TEXT);
 INSERT INTO users VALUES(1,'Owner','owner','owner@test'),(2,'Other','other','other@test'); INSERT INTO supervisor_files VALUES(1,1),(2,2); INSERT INTO boards VALUES(1,'Owned',1),(2,'Shared',2),(3,'Private',2); INSERT INTO lists VALUES(1,1,'Tasks'),(2,2,'Tasks'),(3,3,'Tasks'); INSERT INTO cards VALUES(1,1,'Owned task','2026-09-10','todo','high',0),(2,2,'Shared task','','done','low',0),(3,3,'Private task','','todo','low',0); INSERT INTO board_members VALUES(2,1); INSERT INTO card_assignments VALUES(2,1); INSERT INTO labels VALUES(1,'Meeting','rose'); INSERT INTO card_labels VALUES(2,1);`)
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		role   string
		count  int
		status int
	}{{"admin", 3, 200}, {"supervisor", 2, 200}, {"student", 1, 200}, {"", 0, 403}} {
		req := httptest.NewRequest("GET", "/admin/workspace-calendar", nil)
		req.Header.Set("X-User-Role", tc.role)
		w := httptest.NewRecorder()
		(&API{conn: conn}).WorkspaceCalendar(w, req)
		if w.Code != tc.status {
			t.Fatalf("%s status %d: %s", tc.role, w.Code, w.Body.String())
		}
		if tc.status != 200 {
			continue
		}
		var entries []struct {
			ID        int64  `json:"id"`
			Owner     string `json:"owner"`
			Assignees []any  `json:"assignees"`
			Labels    []any  `json:"labels"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &entries); err != nil {
			t.Fatal(err)
		}
		if len(entries) != tc.count {
			t.Fatalf("%s count %d", tc.role, len(entries))
		}
		for _, e := range entries {
			if e.ID == 2 && (e.Owner != "Other" || len(e.Assignees) != 1 || len(e.Labels) != 1) {
				t.Fatalf("missing metadata: %+v", e)
			}
			if tc.role != "admin" && e.ID == 3 {
				t.Fatal("private board exposed")
			}
		}
	}
}
