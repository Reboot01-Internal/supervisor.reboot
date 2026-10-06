package handlers

import (
	"database/sql"
	"fmt"
	"net/http"
	"taskflow/internal/db"
)

// Resolve exclusively from the verified session; never accept a client member ID.
func (a *API) ownAttendanceMember(w http.ResponseWriter, r *http.Request) (int64, bool) {
	w.Header().Set("Cache-Control", "no-store")
	login, ok := verifiedAttendanceLogin(w, r)
	if !ok {
		return 0, false
	}
	var id int64
	err := a.conn.QueryRow(`SELECT m.id FROM attendance_members m WHERE LOWER(m.nickname)=LOWER(?) AND m.enrolled=1 AND NOT EXISTS(SELECT 1 FROM users u WHERE LOWER(u.nickname)=LOWER(m.nickname) AND u.is_active=0)`, login).Scan(&id)
	if err == sql.ErrNoRows {
		return 0, true
	}
	if err != nil {
		writeErr(w, 500, "Could not load attendance membership")
		return 0, false
	}
	return id, true
}
func (a *API) MyAttendance(w http.ResponseWriter, r *http.Request) {
	id, ok := a.ownAttendanceMember(w, r)
	if !ok {
		return
	}
	if id == 0 {
		writeJSON(w, 200, map[string]any{"enrolled": false, "requirements": []attendanceRequirement{}})
		return
	}
	rows, err := a.conn.Query("SELECT date,required_minutes FROM attendance_dates WHERE member_id=? ORDER BY date", id)
	if err != nil {
		writeErr(w, 500, "Could not load your requirements")
		return
	}
	defer rows.Close()
	items := []attendanceRequirement{}
	for rows.Next() {
		var item attendanceRequirement
		if rows.Scan(&item.Date, &item.Required) != nil {
			writeErr(w, 500, "Could not read requirements")
			return
		}
		items = append(items, item)
	}
	if rows.Err() != nil {
		writeErr(w, 500, "Could not read requirements")
		return
	}
	writeJSON(w, 200, map[string]any{"enrolled": true, "requirements": items})
}
func (a *API) MyAttendanceRecords(w http.ResponseWriter, r *http.Request) {
	id, ok := a.ownAttendanceMember(w, r)
	if !ok {
		return
	}
	if id == 0 {
		writeErr(w, 403, "You are not enrolled in mandatory attendance")
		return
	}
	a.attendanceRecordsForMember(w, r, id)
}

func (a *API) notifyAttendanceStudent(memberID int64, login string, item attendanceRequirement) error {
	var userID int64
	err := a.conn.QueryRow("SELECT id FROM users WHERE LOWER(nickname)=LOWER(?) AND is_active=1", login).Scan(&userID)
	if err == sql.ErrNoRows {
		return nil
	}
	if err != nil {
		return err
	}
	tx, err := a.conn.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	res, err := tx.Exec("INSERT OR IGNORE INTO attendance_date_alerts(member_id,date,status) VALUES(?,?,?)", memberID, item.Date, "student:"+item.Status)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return nil
	}
	body := fmt.Sprintf("%s · Attendance couldn’t be confirmed. %dh %dm required. Review your punch details or contact your administrator.", item.Date, item.Required/60, item.Required%60)
	if item.Status == "below_target" && item.Recorded != nil {
		body = fmt.Sprintf("%s · %dh %dm recorded of %dh %dm required. View your attendance details.", item.Date, *item.Recorded/60, *item.Recorded%60, item.Required/60, item.Required%60)
	}
	var notificationID int64
	err = tx.QueryRow("INSERT INTO app_notifications(user_id,kind,title,body,link) VALUES(?,'attendance','Your attendance needs attention',?,'/attendance') RETURNING id", userID, body).Scan(&notificationID)
	if err != nil {
		return err
	}
	if err = tx.Commit(); err != nil {
		return err
	}
	if a.notifications != nil {
		if notification, e := db.GetNotificationByID(a.conn, notificationID); e == nil {
			a.notifications.broadcast(userID, notification)
		}
	}
	return nil
}
