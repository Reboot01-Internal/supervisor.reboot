package handlers

import (
	"database/sql"
	_ "github.com/mattn/go-sqlite3"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)

func TestUserStatusPreservesHistoryAndScopesAccess(t *testing.T) {
	c, e := sql.Open("sqlite3", ":memory:")
	if e != nil {
		t.Fatal(e)
	}
	defer c.Close()
	_, e = c.Exec(`CREATE TABLE users(id INTEGER PRIMARY KEY,nickname TEXT,email TEXT,role TEXT,is_active INTEGER); CREATE TABLE supervisor_students(supervisor_user_id INTEGER,student_user_id INTEGER); CREATE TABLE supervisor_files(id INTEGER,supervisor_user_id INTEGER); CREATE TABLE boards(id INTEGER,supervisor_file_id INTEGER); CREATE TABLE board_members(board_id INTEGER,user_id INTEGER); CREATE TABLE card_assignments(card_id INTEGER,user_id INTEGER); INSERT INTO users VALUES(1,'staff','staff@test','supervisor',1),(2,'talent','talent@test','student',1),(3,'other','other@test','student',1); INSERT INTO supervisor_students VALUES(1,2); INSERT INTO board_members VALUES(10,2); INSERT INTO card_assignments VALUES(20,2);`)
	if e != nil {
		t.Fatal(e)
	}
	migration, e := os.ReadFile("../../migrations/019_inactive_assignments.sql")
	if e != nil {
		t.Fatal(e)
	}
	if _, e = c.Exec(string(migration)); e != nil {
		t.Fatal(e)
	}
	a := &API{conn: c}
	change := func(body string, want int) {
		t.Helper()
		w := httptest.NewRecorder()
		a.UpdateUserStatus(w, httptest.NewRequest("POST", "/admin/users/status", strings.NewReader(body)))
		if w.Code != want {
			t.Fatalf("status %d: %s", w.Code, w.Body.String())
		}
	}
	change(`{"user_id":3,"is_active":false}`, 403)
	change(`{"user_id":1,"is_active":false}`, 403)
	change(`{"user_id":2,"is_active":false}`, 403)
	change(`{"user_id":2,"is_active":true}`, 403)
	var unchanged bool
	if err := c.QueryRow("SELECT is_active FROM users WHERE id=2").Scan(&unchanged); err != nil || !unchanged {
		t.Fatal("supervisor modified account status")
	}
	if _, err := c.Exec("UPDATE users SET role='admin' WHERE id=1"); err != nil {
		t.Fatal(err)
	}
	change(`{"user_id":1,"is_active":false}`, 403)
	change(`{"user_id":2,"is_active":false}`, 200)
	for _, table := range []string{"board_members", "card_assignments", "supervisor_students"} {
		var n int
		c.QueryRow("SELECT COUNT(*) FROM " + table).Scan(&n)
		if n != 1 {
			t.Fatal("history lost", table)
		}
	}
	for _, q := range []string{"INSERT INTO board_members VALUES(11,2)", "INSERT INTO card_assignments VALUES(21,2)", "INSERT INTO supervisor_students VALUES(3,2)"} {
		if _, e = c.Exec(q); e == nil {
			t.Fatal("inactive assignment accepted")
		}
	}
	req := httptest.NewRequest("GET", "/admin/profile/summary", nil)
	req.Header.Set("X-User-Login", "talent")
	w := httptest.NewRecorder()
	a.RequireActiveAccount(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { t.Fatal("inactive account allowed") })).ServeHTTP(w, req)
	if w.Code != 403 {
		t.Fatal(w.Code)
	}
	change(`{"user_id":2,"is_active":true}`, 200)
	if _, e = c.Exec("INSERT INTO board_members VALUES(11,2)"); e != nil {
		t.Fatal(e)
	}
	c.Exec("UPDATE users SET role='admin' WHERE id=1")
	change(`{"user_id":3,"is_active":false}`, 200)
}
