package handlers

import (
	"database/sql"
	"encoding/base64"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)

func TestOwnAttendanceScope(t *testing.T) {
	conn, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	_, err = conn.Exec(`CREATE TABLE users(id INTEGER PRIMARY KEY,nickname TEXT,full_name TEXT,email TEXT,role TEXT,is_active INTEGER);INSERT INTO users VALUES(1,'student','Student','s@test','student',1);CREATE TABLE app_notifications(id INTEGER PRIMARY KEY,user_id INTEGER,kind TEXT,title TEXT,body TEXT,link TEXT,is_read INTEGER DEFAULT 0,created_at TEXT DEFAULT CURRENT_TIMESTAMP);`)
	if err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"021_attendance_members.sql", "023_attendance_dates.sql"} {
		b, e := os.ReadFile("../../migrations/" + name)
		if e != nil {
			t.Fatal(e)
		}
		if _, e = conn.Exec(string(b)); e != nil {
			t.Fatal(e)
		}
	}
	_, err = conn.Exec(`INSERT INTO attendance_members(id,nickname,email,full_name) VALUES(1,'student','s@test','Student'),(2,'other','o@test','Other');INSERT INTO attendance_dates(member_id,date,required_minutes) VALUES(1,'2026-10-06',180),(2,'2026-10-07',600)`)
	if err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"data":{"user":[{"login":"student"}]}}`))
	}))
	defer server.Close()
	t.Setenv("SCHOOL_URL", server.URL)
	a := &API{conn: conn}
	token := "header." + base64.RawURLEncoding.EncodeToString([]byte(`{"sub":"student"}`)) + ".signature"
	request := func() *http.Request {
		r := httptest.NewRequest("GET", "/?member_id=2", nil)
		r.Header.Set("Authorization", "Bearer "+token)
		r.Header.Set("X-User-Login", "other")
		return r
	}
	w := httptest.NewRecorder()
	a.MyAttendance(w, request())
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"required_minutes":180`) || strings.Contains(w.Body.String(), `600`) {
		t.Fatal("self scope failed", w.Code, w.Body.String())
	}
	w = httptest.NewRecorder()
	a.AttendanceDates(w, request())
	if w.Code != 403 {
		t.Fatal("student accessed admin requirements")
	}
	minutes := 60
	item := attendanceRequirement{Date: "2026-10-01", Required: 180, Recorded: &minutes, Status: "below_target"}
	for i := 0; i < 2; i++ {
		if err = a.notifyAttendanceStudent(1, "student", item); err != nil {
			t.Fatal(err)
		}
	}
	var count int
	conn.QueryRow("SELECT COUNT(*) FROM app_notifications WHERE user_id=1 AND link='/attendance'").Scan(&count)
	if count != 1 {
		t.Fatal("student delivery not deduplicated", count)
	}
	conn.Exec("UPDATE attendance_members SET enrolled=0 WHERE id=1")
	w = httptest.NewRecorder()
	a.MyAttendanceRecords(w, request())
	if w.Code != 403 {
		t.Fatal("archived member accessed records")
	}
	w = httptest.NewRecorder()
	a.MyAttendance(w, httptest.NewRequest("GET", "/", nil))
	if w.Code != 403 {
		t.Fatal("unverified session accepted")
	}
}
