package handlers

import (
	"database/sql"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestPiscineExclusionPermissionsAndMonth(t *testing.T) {
	conn, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	conn.SetMaxOpenConns(1)
	_, err = conn.Exec(`CREATE TABLE users(id INTEGER,role TEXT,is_active INTEGER);CREATE TABLE user_roles(user_id INTEGER,role TEXT);CREATE TABLE supervisor_students(supervisor_user_id INTEGER,student_user_id INTEGER);CREATE TABLE piscine_report_exclusions(student_user_id INTEGER,month TEXT,marked_by INTEGER,marked_at TEXT DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(student_user_id,month));INSERT INTO users VALUES(1,'supervisor',1),(2,'student',1),(3,'student',1);INSERT INTO supervisor_students VALUES(1,2);`)
	if err != nil {
		t.Fatal(err)
	}
	api := &API{conn: conn}
	call := func(body string) int {
		w := httptest.NewRecorder()
		api.MarkPiscineExclusion(w, httptest.NewRequest("POST", "/admin/reports/piscine", strings.NewReader(body)))
		return w.Code
	}
	if got := call(`{"user_id":3,"month":"2025-02","in_piscine":true}`); got != 403 {
		t.Fatalf("Unassigned talent: %d", got)
	}
	if got := call(`{"user_id":2,"month":"2025-02","in_piscine":true}`); got != 200 {
		t.Fatalf("Assigned talent: %d", got)
	}
	if _, err = conn.Exec("ALTER TABLE users ADD COLUMN full_name TEXT; UPDATE users SET full_name='Supervisor' WHERE id=1"); err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		url  string
		code int
		body string
	}{{"/admin/reports/piscine?user_id=2&month=2025-02", 200, `"in_piscine":true`}, {"/admin/reports/piscine?user_id=2&month=2025-03", 200, `"in_piscine":false`}, {"/admin/reports/piscine?user_id=3&month=2025-02", 403, ""}} {
		w := httptest.NewRecorder()
		api.MarkPiscineExclusion(w, httptest.NewRequest("GET", tc.url, nil))
		if w.Code != tc.code || !strings.Contains(w.Body.String(), tc.body) {
			t.Fatalf("Read mark: %d %s", w.Code, w.Body.String())
		}
	}
	var count, active int
	conn.QueryRow("SELECT COUNT(*) FROM piscine_report_exclusions WHERE month='2025-02'").Scan(&count)
	conn.QueryRow("SELECT is_active FROM users WHERE id=2").Scan(&active)
	if count != 1 || active != 1 {
		t.Fatal("Mark missing or account deactivated")
	}
	if got := call(`{"user_id":2,"month":"2025-03","in_piscine":false}`); got != 200 {
		t.Fatal(got)
	}
	conn.QueryRow("SELECT COUNT(*) FROM piscine_report_exclusions").Scan(&count)
	if count != 1 {
		t.Fatal("Unmark affected another month")
	}
	if got := call(`{"user_id":2,"month":"2025-02","in_piscine":false}`); got != 200 {
		t.Fatal(got)
	}
	conn.QueryRow("SELECT COUNT(*) FROM piscine_report_exclusions").Scan(&count)
	if count != 0 {
		t.Fatal("Unmark failed")
	}
	conn.Exec("UPDATE users SET role='student' WHERE id=1")
	if got := call(`{"user_id":2,"month":"2025-02","in_piscine":true}`); got != 403 {
		t.Fatalf("Talent could mark: %d", got)
	}
	conn.Exec("UPDATE users SET role='admin' WHERE id=1")
	if got := call(`{"user_id":3,"month":"2025-02","in_piscine":true}`); got != 200 {
		t.Fatalf("Admin mark: %d", got)
	}
	if got := call(`{"user_id":2,"month":"2999-02","in_piscine":true}`); got != 400 {
		t.Fatalf("Future month accepted: %d", got)
	}
}
