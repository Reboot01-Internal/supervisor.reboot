package handlers

import (
	"strings"
	"time"
)

func reportTimestamp(value string) (time.Time, bool) {
	for _, format := range []string{time.RFC3339Nano, "2006-01-02 15:04:05", "2006-01-02"} {
		if parsed, err := time.Parse(format, strings.TrimSpace(value)); err == nil {
			return parsed, true
		}
	}
	return time.Time{}, false
}

// Four reporting weeks: 1–7, 8–14, 15–21, and 22–month end.
// Assignment and piscine resumption are independent: the later date wins.
func meetingEligibility(start, end time.Time, assigned, resumed string, excluded bool) (string, int) {
	eligible := start
	for _, value := range []string{assigned, resumed} {
		if parsed, ok := reportTimestamp(value); ok && parsed.After(eligible) {
			eligible = parsed
		}
	}
	if excluded || !eligible.Before(end) {
		return eligible.UTC().Format(time.RFC3339), 0
	}
	day := eligible.In(start.Location()).Day()
	target := 4 - (day-1)/7
	if target < 1 {
		target = 1
	}
	return eligible.UTC().Format(time.RFC3339), target
}
