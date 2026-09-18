package handlers

import "testing"

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
