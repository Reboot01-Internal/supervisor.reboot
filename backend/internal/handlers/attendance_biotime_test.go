package handlers

import (
	"context"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"testing"
)

func TestBioTimeAttendanceAndRequirements(t *testing.T) {
	c, e := sql.Open("sqlite3", ":memory:")
	if e != nil {
		t.Fatal(e)
	}
	defer c.Close()
	_, e = c.Exec(`CREATE TABLE users(id INTEGER PRIMARY KEY,nickname TEXT,email TEXT,role TEXT,is_active INTEGER);INSERT INTO users VALUES(1,'staff','staff@test','admin',1);`)
	if e != nil {
		t.Fatal(e)
	}
	for _, f := range []string{"021_attendance_members.sql", "022_attendance_requirements.sql", "023_attendance_dates.sql"} {
		b, e := os.ReadFile("../../migrations/" + f)
		if e != nil {
			t.Fatal(e)
		}
		if _, e = c.Exec(string(b)); e != nil {
			t.Fatal(e)
		}
	}
	c.Exec("INSERT INTO attendance_members(id,nickname,email,full_name) VALUES(1,'example','example@test','Example')")
	a := &API{conn: c}
	calls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.Contains(r.URL.Path, "graphql") {
			json.NewEncoder(w).Encode(map[string]any{"data": map[string]any{"user": []map[string]string{{"login": "staff"}}}})
			return
		}
		calls++
		if r.Header.Get("Authorization") != "Token test-secret" {
			t.Error("missing provider token")
		}
		var rows any
		switch r.URL.Path {
		case "/employees":
			rows = []bioEmployee{{ID: 9, Code: "123", Login: "example"}}
		case "/reports":
			if r.URL.Query().Get("employees") != "9" || r.URL.Query().Get("start_date") != "2026-09-01" {
				t.Error("missing filters")
			}
			rows = []bioReport{{Code: "123", Date: "2026-09-02", First: "08:00", Last: "17:00", Duration: "08:09"}}
		case "/transactions":
			rows = []bioTransaction{{ID: 1, Code: "123", Date: "2026-09-02", Time: "08:00"}, {ID: 2, Code: "123", Date: "2026-09-02", Time: "17:00"}, {ID: 3, Code: "123", Date: "2026-09-03", Time: "08:00"}}
		}
		count := 1
		if r.URL.Path == "/transactions" {
			count = 3
		}
		json.NewEncoder(w).Encode(map[string]any{"count": count, "code": 0, "data": rows, "next": nil})
	}))
	defer server.Close()
	t.Setenv("SCHOOL_URL", server.URL)
	t.Setenv("BIO_TIME_TOKEN", "test-secret")
	t.Setenv("BIO_TIME_EMPLOYEES", server.URL+"/employees")
	t.Setenv("BIO_TIME_RECORDS", server.URL+"/reports")
	t.Setenv("BIO_TIME_TRANSACTIONS", server.URL+"/transactions")
	token := "header." + base64.RawURLEncoding.EncodeToString([]byte(`{"sub":"staff"}`)) + ".signature"
	unauth := httptest.NewRequest("GET", "/", nil)
	unauth.Header.Set("X-User-Login", "staff")
	denied := httptest.NewRecorder()
	a.AttendanceRecords(denied, unauth)
	if denied.Code == 200 {
		t.Fatal("unverified identity accepted")
	}
	request := func(path string) *httptest.ResponseRecorder {
		r := httptest.NewRequest("GET", path, nil)
		r.Header.Set("X-User-Login", "staff")
		r.Header.Set("Authorization", "Bearer "+token)
		w := httptest.NewRecorder()
		a.AttendanceRecords(w, r)
		return w
	}
	w := request("/?member_id=1&startDate=2026-09-01&endDate=2026-09-30")
	if w.Code != 200 || calls != 3 || !strings.Contains(w.Body.String(), `"knownMinutes":489`) || !strings.Contains(w.Body.String(), `"daysWithRecords":2`) {
		t.Fatal(w.Code, w.Body.String(), calls)
	}
	if w.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("missing no-store")
	}
	if request("/?member_id=1&startDate=2026-02-30&endDate=2026-09-30").Code != 400 {
		t.Fatal("invalid date accepted")
	}
	if request("/?member_id=2&startDate=2026-09-01&endDate=2026-09-30").Code != 404 {
		t.Fatal("nonmember accepted")
	}
	for _, tc := range []struct {
		body string
		code int
	}{
		{`{"member_id":1,"period":"week","required_days":8,"required_minutes":600}`, 400},
		{`{"member_id":1,"period":"week","required_days":3,"required_minutes":600}`, 200},
		{`{"member_id":1,"period":"month","required_days":12,"required_minutes":2400}`, 200},
	} {
		r := httptest.NewRequest("POST", "/", strings.NewReader(tc.body))
		r.Header.Set("X-User-Login", "staff")
		w := httptest.NewRecorder()
		a.AttendanceRequirements(w, r)
		if w.Code != tc.code {
			t.Fatal(w.Code, w.Body.String())
		}
	}

	if _, err := c.Exec(`CREATE TABLE app_notifications(id INTEGER PRIMARY KEY,user_id INTEGER,kind TEXT,title TEXT,body TEXT,link TEXT,is_read INTEGER DEFAULT 0,created_at TEXT DEFAULT CURRENT_TIMESTAMP)`); err != nil {
		t.Fatal(err)
	}
	datesRequest := func(body string) int {
		r := httptest.NewRequest("POST", "/", strings.NewReader(body))
		r.Header.Set("Authorization", "Bearer "+token)
		w := httptest.NewRecorder()
		a.AttendanceDates(w, r)
		return w.Code
	}
	if datesRequest(`{"member_id":1,"dates":["2020-01-01","invalid"],"required_minutes":480}`) != 400 {
		t.Fatal("invalid dates accepted")
	}
	if datesRequest(`{"member_id":1,"dates":["2020-01-01","2020-01-02"],"required_minutes":480}`) != 200 {
		t.Fatal("saving dates failed")
	}
	if datesRequest(`{"member_id":1,"dates":["2020-01-01"],"required_minutes":240}`) != 200 {
		t.Fatal("updating date failed")
	}
	for i := 0; i < 2; i++ {
		if _, err := a.evaluateAttendanceDates(1, "example", "2020-01-01", "2020-01-31", nil); err != nil {
			t.Fatal(err)
		}
	}
	var notifications int
	c.QueryRow("SELECT COUNT(*) FROM app_notifications").Scan(&notifications)
	if notifications != 2 {
		t.Fatalf("expected two deduplicated alerts, got %d", notifications)
	}
	if datesRequest(`{"member_id":1,"dates":["2020-01-01"],"remove":true}`) != 200 {
		t.Fatal("removing date failed")
	}
	var remaining int
	c.QueryRow("SELECT COUNT(*) FROM attendance_dates").Scan(&remaining)
	if remaining != 1 {
		t.Fatal("wrong saved date count")
	}
	var period string
	c.QueryRow("SELECT period FROM attendance_requirements WHERE member_id=1").Scan(&period)
	if period != "month" {
		t.Fatal("edit failed")
	}
}
func TestAttendanceMinutes(t *testing.T) {
	for _, tc := range []struct {
		value   string
		minutes int
		ok      bool
	}{{"08:09", 489, true}, {"00:00", 0, true}, {"24:00", 1440, true}, {"08:60", 0, false}, {"-1:30", 0, false}, {"8 hours", 0, false}, {"", 0, false}} {
		n, ok := attendanceMinutes(tc.value)
		if n != tc.minutes || ok != tc.ok {
			t.Errorf("%s: %d %v", tc.value, n, ok)
		}
	}
}

func TestBioTimePagination(t *testing.T) {
	for _, mode := range []string{"valid", "partial", "repeat"} {
		t.Run(mode, func(t *testing.T) {
			calls := 0
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls++
				row := 1
				var next any = "http://untrusted.invalid/?page=2"
				if r.URL.Query().Get("page") == "2" {
					row = 2
					next = nil
					if mode == "repeat" {
						row = 1
					}
				}
				if mode == "partial" {
					next = nil
				}
				json.NewEncoder(w).Encode(map[string]any{"count": 2, "code": 0, "next": next, "data": []int{row}})
			}))
			defer server.Close()
			rows, err := bioPages[int](context.Background(), server.URL, "test", url.Values{})
			if mode == "valid" {
				if err != nil || len(rows) != 2 || calls != 2 {
					t.Fatal(rows, err, calls)
				}
			} else if err == nil {
				t.Fatal("incomplete response accepted")
			}
		})
	}
}
func TestBioTimeDailyIntegrity(t *testing.T) {
	reports := []bioReport{{Code: "1", Date: "2026-10-01", First: "08:00", Last: "17:00", Duration: "08:00"}}
	punch := bioTransaction{ID: 1, Code: "1", Date: "2026-10-01", Time: "08:00", State: "Unknown"}
	days, err := buildAttendanceDays(reports, []bioTransaction{punch, punch}, "1", "example", "2026-10-01", "2026-10-31")
	if err != nil || len(days) != 1 || len(days[0].Punches) != 1 || days[0].Minutes != nil {
		t.Fatal(days, err)
	}
	days, err = buildAttendanceDays(append(reports, reports[0]), nil, "1", "example", "2026-10-01", "2026-10-31")
	if err != nil || days[0].Minutes != nil {
		t.Fatal("duplicate summaries counted")
	}
	punch.Code = "other"
	if _, err = buildAttendanceDays(reports, []bioTransaction{punch}, "1", "example", "2026-10-01", "2026-10-31"); err == nil {
		t.Fatal("foreign employee accepted")
	}
}

func TestRequirementStatuses(t *testing.T) {
	low, enough := 60, 480
	for _, tc := range []struct {
		date    string
		minutes *int
		has     bool
		want    string
	}{
		{"2026-10-07", nil, false, "scheduled"}, {"2026-10-06", nil, false, "in_progress"}, {"2026-10-05", nil, false, "no_record"}, {"2026-10-05", nil, true, "needs_review"}, {"2026-10-05", &low, true, "below_target"}, {"2026-10-05", &enough, true, "met"},
	} {
		if got := requirementStatus(tc.date, "2026-10-06", tc.minutes, tc.has, 480); got != tc.want {
			t.Errorf("got %s want %s", got, tc.want)
		}
	}
}
