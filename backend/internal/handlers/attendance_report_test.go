package handlers

import "testing"

func TestAttendanceReportDueDatesAndHourCredit(t *testing.T) {
	m := attendanceReportMember{Dates: []attendanceRequirement{{Date: "2026-10-01", Required: 240}, {Date: "2026-10-02", Required: 240}, {Date: "2026-10-03", Required: 240}, {Date: "2026-10-04", Required: 240}, {Date: "2026-10-07", Required: 240}, {Date: "2026-10-08", Required: 240}}}
	extra, low := 600, 120
	summarizeAttendanceReport(&m, []attendanceDay{{Date: "2026-10-01", Minutes: &extra}, {Date: "2026-10-02", Minutes: &low}, {Date: "2026-10-03"}}, "2026-10-07")
	if m.Due != 4 || m.Met != 1 || m.Missing != 1 || m.Review != 1 || m.Below != 1 {
		t.Fatalf("wrong counts: %+v", m)
	}
	if m.Percent == nil || *m.Percent != 25 || m.HourPercent == nil || *m.HourPercent != 37.5 {
		t.Fatalf("wrong percentages: %+v", m)
	}
	if m.Required != 960 || m.Recorded != 720 || m.Credit != 360 {
		t.Fatal("hours incorrectly credited")
	}
	if m.Dates[4].Status != "in_progress" || m.Dates[5].Status != "scheduled" {
		t.Fatal("future dates incorrectly penalized")
	}
	empty := attendanceReportMember{}
	summarizeAttendanceReport(&empty, nil, "2026-10-07")
	if empty.Percent != nil || empty.HourPercent != nil {
		t.Fatal("no requirements should not mean zero percent")
	}
}
