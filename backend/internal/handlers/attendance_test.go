package handlers

import (
	"database/sql"
	_ "github.com/mattn/go-sqlite3"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)

func TestAttendanceMembership(t *testing.T) {
	c, e := sql.Open("sqlite3", ":memory:")
	if e != nil {
		t.Fatal(e)
	}
	defer c.Close()
	_, e = c.Exec(`CREATE TABLE users(id INTEGER PRIMARY KEY,nickname TEXT,email TEXT,full_name TEXT,cohort TEXT,role TEXT,is_active INTEGER);
 INSERT INTO users VALUES(1,'staff','staff@test','Staff','','admin',1),(2,'talent','talent@test','Talent','Cohort 1','student',1),(3,'super','super@test','Supervisor','','supervisor',1);`)
	if e != nil {
		t.Fatal(e)
	}
	migration, e := os.ReadFile("../../migrations/021_attendance_members.sql")
	if e != nil {
		t.Fatal(e)
	}
	if _, e = c.Exec(string(migration)); e != nil {
		t.Fatal(e)
	}
	a := &API{conn: c}
	call := func(login, method, body string, want int) {
		t.Helper()
		r := httptest.NewRequest(method, "/admin/attendance/members", strings.NewReader(body))
		r.Header.Set("X-User-Login", login)
		r.Header.Set("X-User-Role", "admin")
		w := httptest.NewRecorder()
		a.AttendanceMembers(w, r)
		if w.Code != want {
			t.Fatalf("%s %s: %d %s", login, method, w.Code, w.Body.String())
		}
	}
	for _, login := range []string{"", "talent", "super", "unknown"} {
		call(login, "GET", "", 403)
		call(login, "POST", `{"nickname":"x","email":"x@test","full_name":"X"}`, 403)
	}
	call("staff", "POST", `{"nickname":"talent","email":"talent@test","full_name":"Talent","cohort":"Cohort 1"}`, 200)
	call("staff", "POST", `{"nickname":"TALENT","email":"talent@test","full_name":"Talent"}`, 200)
	call("staff", "POST", `{"nickname":"new","email":"new@test","full_name":"New"}`, 200)
	call("staff", "POST", `{"id":1,"enrolled":false}`, 200)
	call("staff", "GET", "", 200)
	var n int
	var role string
	var enrolled bool
	c.QueryRow("SELECT COUNT(*) FROM attendance_members").Scan(&n)
	if n != 2 {
		t.Fatal("duplicate membership", n)
	}
	c.QueryRow("SELECT role FROM users WHERE id=2").Scan(&role)
	if role != "student" {
		t.Fatal("role changed")
	}
	c.QueryRow("SELECT enrolled FROM attendance_members WHERE id=1").Scan(&enrolled)
	if enrolled {
		t.Fatal("archive failed")
	}
	c.QueryRow("SELECT COUNT(*) FROM users").Scan(&n)
	if n != 3 {
		t.Fatal("import created a workspace role")
	}
	call("staff", "POST", `{"id":1,"enrolled":true}`, 200)
	c.Exec("UPDATE users SET is_active=0 WHERE id=1")
	call("staff", "GET", "", 403)
}
