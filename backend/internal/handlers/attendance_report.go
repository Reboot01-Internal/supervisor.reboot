package handlers

import (
	"net/http"
	"sync"
	"time"
)

type attendanceReportMember struct {
	ID          int64                   `json:"id"`
	Name        string                  `json:"name"`
	Login       string                  `json:"login"`
	Dates       []attendanceRequirement `json:"dates"`
	Due         int                     `json:"due"`
	Met         int                     `json:"met"`
	Missing     int                     `json:"missing"`
	Review      int                     `json:"review"`
	Below       int                     `json:"below"`
	Required    int                     `json:"required_minutes"`
	Recorded    int                     `json:"recorded_minutes"`
	Credit      int                     `json:"credited_minutes"`
	Percent     *float64                `json:"percent"`
	HourPercent *float64                `json:"hour_percent"`
	Error       string                  `json:"error,omitempty"`
	Synced      string                  `json:"synced,omitempty"`
}

func summarizeAttendanceReport(item *attendanceReportMember, days []attendanceDay, today string) {
	byDate := map[string]attendanceDay{}
	for _, d := range days {
		byDate[d.Date] = d
	}
	for i := range item.Dates {
		r := &item.Dates[i]
		d, ok := byDate[r.Date]
		r.Recorded = d.Minutes
		r.Status = requirementStatus(r.Date, today, d.Minutes, ok, r.Required)
		if r.Date >= today {
			continue
		}
		item.Due++
		item.Required += r.Required
		if d.Minutes != nil {
			item.Recorded += *d.Minutes
			credit := *d.Minutes
			if credit > r.Required {
				credit = r.Required
			}
			item.Credit += credit
		}
		switch r.Status {
		case "met":
			item.Met++
		case "no_record":
			item.Missing++
		case "needs_review":
			item.Review++
		case "below_target":
			item.Below++
		}
	}
	if item.Due > 0 {
		p := float64(item.Met) * 100 / float64(item.Due)
		item.Percent = &p
	}
	if item.Required > 0 {
		p := float64(item.Credit) * 100 / float64(item.Required)
		item.HourPercent = &p
	}
}
func (a *API) AttendanceReport(w http.ResponseWriter, r *http.Request) {
	if !a.verifiedAttendanceAdmin(w, r) {
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	month, err := time.Parse("2006-01", r.URL.Query().Get("month"))
	if err != nil {
		writeErr(w, 400, "Choose a valid month")
		return
	}
	start, end := month.Format("2006-01-02"), month.AddDate(0, 1, -1).Format("2006-01-02")
	rows, err := a.conn.Query(`SELECT m.id,m.full_name,m.nickname,d.date,d.required_minutes FROM attendance_members m LEFT JOIN attendance_dates d ON d.member_id=m.id AND d.date>=? AND d.date<=? WHERE m.enrolled=1 ORDER BY m.full_name,d.date`, start, end)
	if err != nil {
		writeErr(w, 500, "Could not load attendance report")
		return
	}
	items := []attendanceReportMember{}
	indexes := map[int64]int{}
	for rows.Next() {
		var id int64
		var name, login string
		var date *string
		var minutes *int
		if err = rows.Scan(&id, &name, &login, &date, &minutes); err != nil {
			break
		}
		index, ok := indexes[id]
		if !ok {
			index = len(items)
			indexes[id] = index
			items = append(items, attendanceReportMember{ID: id, Name: name, Login: login, Dates: []attendanceRequirement{}})
		}
		if date != nil && minutes != nil {
			items[index].Dates = append(items[index].Dates, attendanceRequirement{Date: *date, Required: *minutes})
		}
	}
	if err == nil {
		err = rows.Err()
	}
	rows.Close()
	if err != nil {
		writeErr(w, 500, "Could not read attendance report")
		return
	}
	today := time.Now().In(time.FixedZone("Bahrain", 10800)).Format("2006-01-02")
	var wg sync.WaitGroup
	limit := make(chan struct{}, 4)
	for i := range items {
		if len(items[i].Dates) == 0 {
			continue
		}
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			select {
			case limit <- struct{}{}:
			case <-r.Context().Done():
				items[i].Error = "Report interrupted"
				return
			}
			defer func() { <-limit }()
			past := false
			for _, d := range items[i].Dates {
				if d.Date <= today {
					past = true
				}
			}
			if !past {
				summarizeAttendanceReport(&items[i], nil, today)
				return
			}
			days, at, e := fetchBioAttendanceSnapshot(r.Context(), items[i].Login, start, end)
			if e != nil {
				items[i].Error = e.Error()
				return
			}
			items[i].Synced = at.UTC().Format(time.RFC3339)
			summarizeAttendanceReport(&items[i], days, today)
		}(i)
	}
	wg.Wait()
	writeJSON(w, 200, map[string]any{"month": r.URL.Query().Get("month"), "today": today, "members": items})
}
