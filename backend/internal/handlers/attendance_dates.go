package handlers

import (
	"fmt"
	"net/http"
	"strconv"
	"taskflow/internal/db"
	"taskflow/internal/utils"
	"time"
)

type attendanceRequirement struct {
	Date     string `json:"date"`
	Required int    `json:"required_minutes"`
	Status   string `json:"status,omitempty"`
	Recorded *int   `json:"recorded_minutes"`
}

func (a *API) AttendanceDates(w http.ResponseWriter, r *http.Request) {
	if !a.verifiedAttendanceAdmin(w, r) {
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	if r.Method == "GET" {
		id, e := strconv.ParseInt(r.URL.Query().Get("member_id"), 10, 64)
		if e != nil || id <= 0 {
			writeErr(w, 400, "Valid member required")
			return
		}
		rows, e := a.conn.Query("SELECT date,required_minutes FROM attendance_dates WHERE member_id=? ORDER BY date", id)
		if e != nil {
			writeErr(w, 500, "Could not load dates")
			return
		}
		defer rows.Close()
		result := []attendanceRequirement{}
		for rows.Next() {
			var item attendanceRequirement
			if rows.Scan(&item.Date, &item.Required) != nil {
				writeErr(w, 500, "Could not read dates")
				return
			}
			result = append(result, item)
		}
		if rows.Err() != nil {
			writeErr(w, 500, "Could not read dates")
			return
		}
		writeJSON(w, 200, result)
		return
	}
	var req struct {
		MemberID int64    `json:"member_id"`
		Dates    []string `json:"dates"`
		Minutes  int      `json:"required_minutes"`
		Remove   bool     `json:"remove"`
	}
	if utils.ReadJSON(r, &req) != nil || len(req.Dates) == 0 || len(req.Dates) > 366 || (!req.Remove && (req.Minutes < 1 || req.Minutes > 1440)) {
		writeErr(w, 400, "Select dates and between 1 minute and 24 hours per date")
		return
	}
	for _, d := range req.Dates {
		if _, e := time.Parse("2006-01-02", d); e != nil {
			writeErr(w, 400, "Invalid date")
			return
		}
	}
	var id int64
	if a.conn.QueryRow("SELECT id FROM attendance_members WHERE id=?", req.MemberID).Scan(&id) != nil {
		writeErr(w, 404, "Member not found")
		return
	}
	tx, e := a.conn.Begin()
	if e != nil {
		writeErr(w, 500, "Could not save dates")
		return
	}
	defer tx.Rollback()
	for _, d := range req.Dates {
		if req.Remove {
			_, e = tx.Exec("DELETE FROM attendance_dates WHERE member_id=? AND date=?", id, d)
		} else {
			_, e = tx.Exec("INSERT INTO attendance_dates(member_id,date,required_minutes) VALUES(?,?,?) ON CONFLICT(member_id,date) DO UPDATE SET required_minutes=excluded.required_minutes,updated_at=datetime('now')", id, d, req.Minutes)
		}
		if e != nil {
			writeErr(w, 500, "Could not save dates")
			return
		}
	}
	if tx.Commit() != nil {
		writeErr(w, 500, "Could not save dates")
		return
	}
	writeJSON(w, 200, map[string]bool{"ok": true})
}
func requirementStatus(date, today string, minutes *int, hasRecord bool, required int) string {
	if date > today {
		return "scheduled"
	}
	if minutes != nil && *minutes >= required {
		return "met"
	}
	if date == today {
		return "in_progress"
	}
	if !hasRecord {
		return "no_record"
	}
	if minutes == nil {
		return "needs_review"
	}
	return "below_target"
}
func (a *API) evaluateAttendanceDates(id int64, login, start, end string, days []attendanceDay) ([]attendanceRequirement, error) {
	rows, e := a.conn.Query("SELECT date,required_minutes FROM attendance_dates WHERE member_id=? AND date>=? AND date<=? ORDER BY date", id, start, end)
	if e != nil {
		return nil, e
	}
	result := []attendanceRequirement{}
	for rows.Next() {
		var item attendanceRequirement
		if e = rows.Scan(&item.Date, &item.Required); e != nil {
			rows.Close()
			return nil, e
		}
		result = append(result, item)
	}
	e = rows.Err()
	rows.Close()
	if e != nil {
		return nil, e
	}
	byDate := map[string]attendanceDay{}
	for _, d := range days {
		byDate[d.Date] = d
	}
	today := time.Now().In(time.FixedZone("Bahrain", 3*3600)).Format("2006-01-02")
	for i := range result {
		item := &result[i]
		d, ok := byDate[item.Date]
		item.Recorded = d.Minutes
		item.Status = requirementStatus(item.Date, today, d.Minutes, ok, item.Required)
		if item.Status == "no_record" || item.Status == "below_target" || item.Status == "needs_review" {
			if err := a.notifyAttendanceStudent(id, login, *item); err != nil {
				return nil, err
			}
			// A unique alert per date/status prevents repeated notifications on refresh.
			tx, err := a.conn.Begin()
			if err != nil {
				return nil, err
			}
			res, err := tx.Exec("INSERT OR IGNORE INTO attendance_date_alerts(member_id,date,status) VALUES(?,?,?)", id, item.Date, item.Status)
			if err != nil {
				tx.Rollback()
				return nil, err
			}
			n, _ := res.RowsAffected()
			var deliveryIDs []int64
			if n > 0 {
				label := map[string]string{"no_record": "No attendance record", "below_target": "Below required hours", "needs_review": "Incomplete punches"}[item.Status]
				body := fmt.Sprintf("%s · %s: %s. Required: %dh %dm. Review attendance details before confirming absence.", login, item.Date, label, item.Required/60, item.Required%60)
				deliveries, insertErr := tx.Query(`INSERT INTO app_notifications(user_id,kind,title,body,link) SELECT id,'attendance','Attendance needs review',?, '/admin/attendance' FROM users WHERE LOWER(TRIM(role))='admin' AND is_active=1 RETURNING id`, body)
				err = insertErr
				if err == nil {
					for deliveries.Next() {
						var deliveryID int64
						if err = deliveries.Scan(&deliveryID); err != nil {
							break
						}
						deliveryIDs = append(deliveryIDs, deliveryID)
					}
					if err == nil {
						err = deliveries.Err()
					}
					deliveries.Close()
				}
				if err == nil && len(deliveryIDs) == 0 {
					tx.Rollback()
					continue
				}
			}
			if err != nil {
				tx.Rollback()
				return nil, err
			}
			if err = tx.Commit(); err != nil {
				return nil, err
			}
			if a.notifications != nil {
				for _, deliveryID := range deliveryIDs {
					if notification, fetchErr := db.GetNotificationByID(a.conn, deliveryID); fetchErr == nil {
						a.notifications.broadcast(notification.UserID, notification)
					}
				}
			}
		}
	}
	return result, nil
}
