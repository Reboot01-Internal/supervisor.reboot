package handlers

import (
	"database/sql"
	"net/http"
	"strconv"
	"strings"
	"taskflow/internal/utils"
)

// Resolve existing staff only; never use the development actor fallback or caller-supplied role.
func (a *API) attendanceAdmin(w http.ResponseWriter, r *http.Request) bool {
	login := strings.TrimSpace(r.Header.Get("X-User-Login"))
	email := strings.TrimSpace(r.Header.Get("X-User-Email"))
	var storedLogin, role string
	var active bool
	err := a.conn.QueryRow("SELECT nickname,role,is_active FROM users WHERE (?<>'' AND LOWER(nickname)=LOWER(?)) OR (?='' AND ?<>'' AND LOWER(email)=LOWER(?))", login, login, login, email, email).Scan(&storedLogin, &role, &active)
	if err != nil || !active || resolvedRole(storedLogin, role) != "admin" {
		writeErr(w, 403, "admin access required")
		return false
	}
	return true
}

func (a *API) AttendanceMembers(w http.ResponseWriter, r *http.Request) {
	if !a.attendanceAdmin(w, r) {
		return
	}
	if r.Method == "GET" {
		rows, err := a.conn.Query(`SELECT m.id,m.nickname,m.email,COALESCE(u.full_name,m.full_name),COALESCE(u.cohort,m.cohort),m.enrolled,m.created_at,COALESCE(u.id,0),COALESCE(u.role,''),COALESCE(u.is_active,1)
 FROM attendance_members m LEFT JOIN users u ON LOWER(u.nickname)=LOWER(m.nickname) ORDER BY m.full_name`)
		if err != nil {
			writeErr(w, 500, "Could not load members")
			return
		}
		defer rows.Close()
		result := []map[string]any{}
		for rows.Next() {
			var id, uid int64
			var login, email, name, cohort, created, role string
			var enrolled, active bool
			if rows.Scan(&id, &login, &email, &name, &cohort, &enrolled, &created, &uid, &role, &active) != nil {
				writeErr(w, 500, "Could not read members")
				return
			}
			result = append(result, map[string]any{"id": id, "nickname": login, "email": email, "full_name": name, "cohort": cohort, "enrolled": enrolled, "created_at": created, "user_id": uid, "role": role, "is_active": active})
		}
		if rows.Err() != nil {
			writeErr(w, 500, "Could not read members")
			return
		}
		writeJSON(w, 200, result)
		return
	}
	var req struct {
		Nickname string `json:"nickname"`
		Email    string `json:"email"`
		FullName string `json:"full_name"`
		Cohort   string `json:"cohort"`
		ID       int64  `json:"id"`
		Enrolled *bool  `json:"enrolled"`
	}
	if utils.ReadJSON(r, &req) != nil {
		writeErr(w, 400, "Invalid member")
		return
	}
	if req.ID > 0 && req.Enrolled != nil {
		res, err := a.conn.Exec("UPDATE attendance_members SET enrolled=? WHERE id=?", *req.Enrolled, req.ID)
		if err != nil {
			writeErr(w, 500, "Could not update membership")
			return
		}
		n, _ := res.RowsAffected()
		if n == 0 {
			writeErr(w, 404, "Member not found")
			return
		}
	} else {
		req.Nickname = strings.ToLower(strings.TrimSpace(req.Nickname))
		req.Email = strings.ToLower(strings.TrimSpace(req.Email))
		req.FullName = strings.TrimSpace(req.FullName)
		if req.Nickname == "" || !strings.Contains(req.Email, "@") || req.FullName == "" {
			writeErr(w, 400, "Name, username and email required")
			return
		}
		_, err := a.conn.Exec(`INSERT INTO attendance_members(nickname,email,full_name,cohort) VALUES(?,?,?,?) ON CONFLICT(nickname) DO UPDATE SET enrolled=1`, req.Nickname, req.Email, req.FullName, strings.TrimSpace(req.Cohort))
		if err != nil {
			writeErr(w, 409, "Member already exists with this email")
			return
		}
	}
	writeJSON(w, 200, map[string]bool{"ok": true})
}

func (a *API) AttendanceRequirements(w http.ResponseWriter, r *http.Request) {
	if !a.attendanceAdmin(w, r) {
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	if r.Method == "GET" {
		id, err := strconv.ParseInt(r.URL.Query().Get("member_id"), 10, 64)
		if err != nil || id <= 0 {
			writeErr(w, 400, "Valid member required")
			return
		}
		var period, updated string
		var days, minutes int
		err = a.conn.QueryRow("SELECT period,required_days,required_minutes,updated_at FROM attendance_requirements WHERE member_id=?", id).Scan(&period, &days, &minutes, &updated)
		if err == sql.ErrNoRows {
			writeJSON(w, 200, nil)
			return
		}
		if err != nil {
			writeErr(w, 500, "Could not load requirements")
			return
		}
		writeJSON(w, 200, map[string]any{"period": period, "required_days": days, "required_minutes": minutes, "updated_at": updated})
		return
	}
	var req struct {
		MemberID int64  `json:"member_id"`
		Period   string `json:"period"`
		Days     int    `json:"required_days"`
		Minutes  int    `json:"required_minutes"`
	}
	if utils.ReadJSON(r, &req) != nil {
		writeErr(w, 400, "Invalid requirements")
		return
	}
	maxDays := 31
	if req.Period == "week" {
		maxDays = 7
	}
	if (req.Period != "week" && req.Period != "month") || req.Days < 1 || req.Days > maxDays || req.Minutes < 1 || req.Minutes > maxDays*24*60 {
		writeErr(w, 400, "Choose a week or month and valid days and hours for that period")
		return
	}
	var exists int
	if a.conn.QueryRow("SELECT id FROM attendance_members WHERE id=?", req.MemberID).Scan(&exists) != nil {
		writeErr(w, 404, "Member not found")
		return
	}
	_, err := a.conn.Exec(`INSERT INTO attendance_requirements(member_id,period,required_days,required_minutes) VALUES(?,?,?,?) ON CONFLICT(member_id) DO UPDATE SET period=excluded.period,required_days=excluded.required_days,required_minutes=excluded.required_minutes,updated_at=datetime('now')`, req.MemberID, req.Period, req.Days, req.Minutes)
	if err != nil {
		writeErr(w, 500, "Could not save requirements")
		return
	}
	writeJSON(w, 200, map[string]bool{"ok": true})
}
