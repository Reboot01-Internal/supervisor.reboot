package handlers

import (
	"database/sql"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestRustPiscineAttemptHistory(t *testing.T) {
	fail, pass := 0.5, 1.0
	type attempt struct {
		done  bool
		grade *float64
	}
	working := attempt{false, nil}
	failed := attempt{true, &fail}
	passed := attempt{true, &pass}
	unavailable := attempt{true, nil}
	for _, tc := range []struct {
		name     string
		attempts []attempt // newest first
		want     string
	}{
		{"retry after failure", []attempt{working, failed}, "failed"},
		{"multiple retries and failures", []attempt{working, working, failed, working, failed}, "failed"},
		{"failure before older working record", []attempt{failed, working}, "failed"},
		{"older pass wins", []attempt{working, failed, passed}, "passed"},
		{"newer pass wins", []attempt{passed, failed, working}, "passed"},
		{"only working", []attempt{working, working}, "working"},
		{"unfinished grade is not a failure", []attempt{{false, &fail}}, "working"},
		{"missing grade is unavailable", []attempt{unavailable, working}, "unknown"},
		{"latest working without result", []attempt{working, unavailable}, "working"},
		{"failure survives missing grade", []attempt{unavailable, failed}, "failed"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got := ""
			for _, a := range tc.attempts {
				got = mergeRustPiscineStatus(got, a.done, a.grade)
			}
			if got != tc.want {
				t.Fatalf("got %q, want %q", got, tc.want)
			}
		})
	}
}

func TestPiscineStatusesRejectTalents(t *testing.T) {
	conn, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	if _, err := conn.Exec(`CREATE TABLE users (id INTEGER, nickname TEXT, role TEXT); INSERT INTO users VALUES (1, 'test-talent', 'student')`); err != nil {
		t.Fatal(err)
	}
	api := &API{conn: conn}
	for name, handler := range map[string]http.HandlerFunc{"rust": api.RustPiscineStatuses, "js": api.JSPiscineStatuses} {
		t.Run(name, func(t *testing.T) {
			response := httptest.NewRecorder()
			handler(response, httptest.NewRequest("GET", "/admin/users/"+name+"-status", nil))
			if response.Code != http.StatusForbidden {
				t.Fatalf("got %d, want 403", response.Code)
			}
		})
	}
}
