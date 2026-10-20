package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"taskflow/internal/db"
)

func TestPiscineSyncPreservesHistoryAndProratesReport(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.URL.Path == "/api/auth/token" {
			w.Write([]byte(`"local-test-token"`))
			return
		}
		w.Write([]byte(`{"data":{"user":[{"login":"talent"}],"progress":[{"userLogin":"talent","path":"/bahrain/bh-module/piscine-rust","grade":1,"isDone":true,"updatedAt":"2024-12-10T10:00:00Z"},{"userLogin":"talent","path":"/bahrain/bh-module/piscine-js","grade":1.1,"isDone":true,"updatedAt":"2025-02-10T10:00:00Z"}]}}`))
	}))
	defer server.Close()
	t.Setenv("SCHOOL_URL", server.URL)
	t.Setenv("TOKEN", "local-test-bootstrap")
	rebootAdminTokenCache.Lock()
	oldToken, oldExpiry := rebootAdminTokenCache.token, rebootAdminTokenCache.expiresAt
	rebootAdminTokenCache.token = ""
	rebootAdminTokenCache.Unlock()
	t.Cleanup(func() {
		rebootAdminTokenCache.Lock()
		rebootAdminTokenCache.token = oldToken
		rebootAdminTokenCache.expiresAt = oldExpiry
		rebootAdminTokenCache.Unlock()
	})
	conn, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	conn.SetMaxOpenConns(1)
	for _, file := range []string{"001_init.sql", "002_activity.sql", "005_supervisor_assignments.sql", "010_meetings.sql", "012_meeting_phase1.sql", "015_user_roles.sql", "024_piscine_report_exclusions.sql"} {
		data, err := os.ReadFile("../../migrations/" + file)
		if err != nil {
			t.Fatal(err)
		}
		if _, err = conn.Exec(string(data)); err != nil {
			t.Fatalf("%s: %v", file, err)
		}
	}
	// The migration can be retried safely and retains legacy monthly marks.
	for i := 0; i < 2; i++ {
		if err = db.EnsurePiscineResumeDates(conn); err != nil {
			t.Fatal(err)
		}
	}
	_, err = conn.Exec(`INSERT INTO users(id,full_name,email,password_hash,role,nickname,cohort) VALUES(1,'Admin','a','','admin','admin',''),(2,'Supervisor','s','','supervisor','supervisor',''),(3,'Talent','t','','student','talent','');
 INSERT INTO supervisor_students(supervisor_user_id,student_user_id,assigned_at) VALUES(2,3,'2024-12-01 00:00:00');
 INSERT INTO piscine_report_exclusions(student_user_id,month,marked_by,marked_at) VALUES(3,'2025-01',1,'2025-01-01T00:00:00Z'),(3,'2025-02',1,'2025-02-01T00:00:00Z');`)
	if err != nil {
		t.Fatal(err)
	}
	a := &API{conn: conn}
	type journey struct {
		InPiscine    bool   `json:"in_piscine"`
		Target       int    `json:"meeting_target"`
		EligibleFrom string `json:"eligible_from"`
	}
	read := func(month string) []journey {
		t.Helper()
		w := httptest.NewRecorder()
		a.AdminMonthlyReport(w, httptest.NewRequest("GET", "/admin/reports/monthly?month="+month, nil))
		if w.Code != 200 {
			t.Fatalf("%d %s", w.Code, w.Body.String())
		}
		var result struct {
			Journeys []journey `json:"journeys"`
			Warning  string    `json:"eligibility_warning"`
		}
		if err = json.Unmarshal(w.Body.Bytes(), &result); err != nil {
			t.Fatal(err)
		}
		if result.Warning != "" {
			t.Fatal(result.Warning)
		}
		return result.Journeys
	}
	feb := read("2025-02")
	if len(feb) != 1 || feb[0].InPiscine || feb[0].Target != 3 || feb[0].EligibleFrom != "2025-02-10T10:00:00Z" {
		t.Fatalf("wrong pass-month result: %+v", feb)
	}
	jan := read("2025-01")
	if len(jan) != 1 || !jan[0].InPiscine || jan[0].Target != 0 {
		t.Fatalf("lost past exclusion: %+v", jan)
	}
	var count int
	conn.QueryRow("SELECT COUNT(*) FROM piscine_report_exclusions").Scan(&count)
	if count != 2 {
		t.Fatal("deleted historical marks")
	}
	// A later assignment further reduces the target and attendance start.
	conn.Exec("UPDATE supervisor_students SET assigned_at='2025-02-24 12:00:00'")
	feb = read("2025-02")
	if len(feb) != 1 || feb[0].Target != 1 || feb[0].EligibleFrom != "2025-02-24T12:00:00Z" {
		t.Fatalf("ignored later assignment: %+v", feb)
	}
	if jan = read("2025-01"); len(jan) != 0 {
		t.Fatal("assignment leaked into earlier report")
	}
	march := read("2025-03")
	if len(march) != 1 || march[0].Target != 4 {
		t.Fatalf("did not restore full monthly target: %+v", march)
	}
	w := httptest.NewRecorder()
	a.MarkPiscineExclusion(w, httptest.NewRequest("GET", "/admin/reports/piscine?user_id=3&month=2025-02", nil))
	var mark struct {
		InPiscine bool   `json:"in_piscine"`
		ResumedAt string `json:"resumed_at"`
	}
	json.Unmarshal(w.Body.Bytes(), &mark)
	if w.Code != 200 || mark.InPiscine || mark.ResumedAt != "2025-02-10T10:00:00Z" {
		t.Fatalf("profile still marked: %d %s", w.Code, w.Body.String())
	}
}
