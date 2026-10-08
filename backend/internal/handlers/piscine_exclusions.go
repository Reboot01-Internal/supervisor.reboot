package handlers

import (
	"database/sql"
	"net/http"
	"strconv"
	"taskflow/internal/db"
	"taskflow/internal/utils"
	"time"
)

// MarkPiscineExclusion keeps the account active and changes only monthly review eligibility.
func (a *API) MarkPiscineExclusion(w http.ResponseWriter, r *http.Request) {
	actor := actorID(r, a.conn)
	admin, err := db.UserHasRole(a.conn, actor, "admin")
	if err != nil {
		writeErr(w, 403, "staff access required")
		return
	}
	supervisor, err := db.UserHasRole(a.conn, actor, "supervisor")
	var active bool
	if err != nil || (!admin && !supervisor) || a.conn.QueryRow("SELECT is_active FROM users WHERE id=?", actor).Scan(&active) != nil || !active {
		writeErr(w, 403, "active staff access required")
		return
	}
	var req struct {
		UserID    int64  `json:"user_id"`
		Month     string `json:"month"`
		InPiscine *bool  `json:"in_piscine"`
	}
	if r.Method == http.MethodGet {
		req.UserID, _ = strconv.ParseInt(r.URL.Query().Get("user_id"), 10, 64)
		req.Month = r.URL.Query().Get("month")
	} else if utils.ReadJSON(r, &req) != nil {
		writeErr(w, 400, "invalid request")
		return
	}
	if req.UserID <= 0 || (r.Method != http.MethodGet && req.InPiscine == nil) {
		writeErr(w, 400, "user_id, month and in_piscine required")
		return
	}
	start, err := time.ParseInLocation("2006-01", req.Month, time.FixedZone("Asia/Bahrain", 10800))
	if err != nil || start.After(time.Now()) {
		writeErr(w, 400, "invalid month")
		return
	}
	student, err := db.UserHasRole(a.conn, req.UserID, "student")
	if err != nil || !student {
		writeErr(w, 400, "talent account required")
		return
	}
	if !admin {
		assigned, err := db.IsStudentAssignedToSupervisor(a.conn, actor, req.UserID)
		if err != nil || !assigned {
			writeErr(w, 403, "only assigned talents can be marked")
			return
		}
	}
	if r.Method == http.MethodGet {
		var markedBy, markedAt string
		err = a.conn.QueryRow(`SELECT u.full_name,pe.marked_at FROM piscine_report_exclusions pe JOIN users u ON u.id=pe.marked_by WHERE pe.student_user_id=? AND pe.month=?`, req.UserID, req.Month).Scan(&markedBy, &markedAt)
		if err != nil && err != sql.ErrNoRows {
			writeErr(w, 500, "could not load piscine mark")
			return
		}
		writeJSON(w, 200, map[string]any{"in_piscine": err == nil, "marked_by": markedBy, "marked_at": markedAt})
		return
	}
	if *req.InPiscine {
		_, err = a.conn.Exec(`INSERT INTO piscine_report_exclusions(student_user_id,month,marked_by) VALUES(?,?,?) ON CONFLICT(student_user_id,month) DO UPDATE SET marked_by=excluded.marked_by,marked_at=strftime('%Y-%m-%dT%H:%M:%SZ','now')`, req.UserID, req.Month, actor)
	} else {
		_, err = a.conn.Exec("DELETE FROM piscine_report_exclusions WHERE student_user_id=? AND month=?", req.UserID, req.Month)
	}
	if err != nil {
		writeErr(w, 500, "could not save piscine mark")
		return
	}
	writeJSON(w, 200, map[string]any{"in_piscine": *req.InPiscine})
}
