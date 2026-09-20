package handlers

import (
	"database/sql"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestDeleteCardOnSharedBoard(t *testing.T) {
	for _, tc := range []struct {
		name, role    string
		owner, member bool
		want          int
	}{
		{"supervisor member", "supervisor", false, true, 200},
		{"supervisor owner", "supervisor", true, false, 200},
		{"unrelated supervisor", "supervisor", false, false, 403},
		{"student member", "student", false, true, 403},
		{"admin", "admin", false, false, 200},
	} {
		t.Run(tc.name, func(t *testing.T) {
			conn, err := sql.Open("sqlite3", ":memory:")
			if err != nil {
				t.Fatal(err)
			}
			defer conn.Close()
			_, err = conn.Exec(`CREATE TABLE supervisor_files(id INTEGER,supervisor_user_id INTEGER); CREATE TABLE boards(id INTEGER,supervisor_file_id INTEGER); CREATE TABLE board_members(board_id INTEGER,user_id INTEGER); CREATE TABLE lists(id INTEGER,board_id INTEGER); CREATE TABLE cards(id INTEGER,list_id INTEGER); INSERT INTO supervisor_files VALUES(1,2); INSERT INTO boards VALUES(10,1); INSERT INTO lists VALUES(20,10); INSERT INTO cards VALUES(30,20);`)
			if err != nil {
				t.Fatal(err)
			}
			if tc.owner {
				conn.Exec("UPDATE supervisor_files SET supervisor_user_id=1")
			}
			if tc.member {
				conn.Exec("INSERT INTO board_members VALUES(10,1)")
			}
			req := httptest.NewRequest("POST", "/admin/card/delete", strings.NewReader(`{"card_id":30}`))
			req.Header.Set("X-User-Role", tc.role)
			w := httptest.NewRecorder()
			a := &API{conn: conn}
			a.AdminDeleteCard(w, req)
			if w.Code != tc.want {
				t.Fatalf("got %d want %d: %s", w.Code, tc.want, w.Body.String())
			}
			var remaining int
			conn.QueryRow("SELECT COUNT(*) FROM cards WHERE id=30").Scan(&remaining)
			if (remaining == 0) != (tc.want == 200) {
				t.Fatal("unexpected card deletion")
			}
		})
	}
}
