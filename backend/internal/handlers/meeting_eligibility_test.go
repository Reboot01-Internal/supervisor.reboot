package handlers

import (
	"testing"
	"time"
)

func TestMeetingTargetsUseLaterAssignmentAndPiscineDates(t *testing.T) {
	zone := time.FixedZone("Asia/Bahrain", 10800)
	start := time.Date(2026, 10, 1, 0, 0, 0, 0, zone)
	end := start.AddDate(0, 1, 0)
	for _, tc := range []struct {
		name, assigned, resumed string
		excluded                bool
		want                    int
		day                     int
	}{
		{"full month", "2026-09-01T00:00:00Z", "", false, 4, 1},
		{"week one", "2026-10-06T00:00:00+03:00", "", false, 4, 6},
		{"week two", "2026-10-08T00:00:00+03:00", "", false, 3, 8},
		{"week three", "2026-10-15T00:00:00+03:00", "", false, 2, 15},
		{"week four", "2026-10-22T00:00:00+03:00", "", false, 1, 22},
		{"month tail", "2026-10-31T23:00:00+03:00", "", false, 1, 31},
		{"Bahrain boundary", "2026-10-07T21:00:00Z", "", false, 3, 8},
		{"pass later", "2026-10-01 00:00:00", "2026-10-15T10:00:00Z", false, 2, 15},
		{"assignment later", "2026-10-24T10:00:00Z", "2026-10-08T10:00:00Z", false, 1, 24},
		{"still excluded", "2026-09-01T00:00:00Z", "", true, 0, 1},
		{"future assignment", "2026-11-01T00:00:00+03:00", "", false, 0, 1},
	} {
		t.Run(tc.name, func(t *testing.T) {
			eligible, target := meetingEligibility(start, end, tc.assigned, tc.resumed, tc.excluded)
			parsed, err := time.Parse(time.RFC3339, eligible)
			if target != tc.want || err != nil || parsed.In(zone).Day() != tc.day {
				t.Fatalf("got %s / %d want day %d / %d", eligible, target, tc.day, tc.want)
			}
		})
	}
}

func TestPiscinePassDatesPreserveHistoricalExclusions(t *testing.T) {
	grade := 1.0
	records := []piscineProgressRecord{
		{Login: "a", Path: "/bahrain/bh-module/piscine-rust", Done: true, Grade: &grade, UpdatedAt: "2026-07-10T10:00:00Z"},
		{Login: "a", Path: "/bahrain/bh-module/piscine-js", Done: true, Grade: &grade, UpdatedAt: "2026-10-09T10:00:00Z"},
		{Login: "a", Path: "/bahrain/bh-module/piscine-js", Done: true, Grade: &grade, UpdatedAt: "2026-10-12T10:00:00Z"},
	}
	completions := piscineCompletions([]string{"a"}, records)
	july, _ := time.Parse(time.RFC3339, "2026-07-01T00:00:00Z")
	october := july.AddDate(0, 3, 0)
	if got := completions["a"].resumeDate(july).Format("2006-01-02"); got != "2026-07-10" {
		t.Fatal(got)
	}
	if got := completions["a"].resumeDate(october).Format("2006-01-02"); got != "2026-10-09" {
		t.Fatal(got)
	}
	// The latest retry does not postpone a previously recorded pass.
	records = append(records, piscineProgressRecord{Login: "a", Path: "/bahrain/bh-module/piscine-js", UpdatedAt: "2026-10-15T10:00:00Z"})
	if got := piscineCompletions([]string{"a"}, records)["a"].resumeDate(october).Format("2006-01-02"); got != "2026-10-09" {
		t.Fatal(got)
	}
	if got := piscineCompletions([]string{"a"}, nil)["a"].resumeDate(october); !got.IsZero() {
		t.Fatal("invented completion date")
	}
	records[0].UpdatedAt = "invalid"
	if got := piscineCompletions([]string{"a"}, records)["a"].resumeDate(october); !got.IsZero() {
		t.Fatal("used undated pass")
	}
}
