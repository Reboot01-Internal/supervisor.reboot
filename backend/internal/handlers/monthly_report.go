package handlers

import (
	"net/http"
	"taskflow/internal/db"
	"time"
)

// AdminMonthlyReport returns dated evidence, not inferred historical task states.
func (a *API) AdminMonthlyReport(w http.ResponseWriter, r *http.Request) {
	actor := actorID(r, a.conn)
	admin, err := db.UserHasRole(a.conn, actor, "admin")
	if err != nil {
		writeErr(w, 403, "report access required")
		return
	}
	supervisor, err := db.UserHasRole(a.conn, actor, "supervisor")
	if err != nil || (!admin && !supervisor) {
		writeErr(w, 403, "report access required")
		return
	}
	// Administrators review everyone; supervisors can only review their own evidence.
	scope := actor
	if admin {
		scope = 0
	}
	zone := time.FixedZone("Asia/Bahrain", 3*60*60)
	start, err := time.ParseInLocation("2006-01", r.URL.Query().Get("month"), zone)
	if err != nil || start.After(time.Now()) {
		writeErr(w, 400, "invalid month")
		return
	}
	end := start.AddDate(0, 1, 0)
	from, to := start.UTC().Format(time.RFC3339), end.UTC().Format(time.RFC3339)
	type Evidence struct {
		SupervisorID int64 `json:"supervisor_id"`
		BoardID      int64 `json:"board_id"`
		Added        int   `json:"added"`
		Done         int   `json:"done"`
	}
	evidence := []Evidence{}
	rows, err := a.conn.Query(`SELECT sf.supervisor_user_id,b.id,
 (SELECT COUNT(*) FROM cards c JOIN lists l ON l.id=c.list_id WHERE l.board_id=b.id AND datetime(c.created_at)>=datetime(?) AND datetime(c.created_at)<datetime(?)),
 (SELECT COUNT(DISTINCT ca.card_id) FROM card_activity ca JOIN cards c ON c.id=ca.card_id JOIN lists l ON l.id=c.list_id WHERE l.board_id=b.id AND ca.action='status_done' AND datetime(ca.created_at)>=datetime(?) AND datetime(ca.created_at)<datetime(?))
 FROM boards b JOIN supervisor_files sf ON sf.id=b.supervisor_file_id WHERE (?=0 OR sf.supervisor_user_id=?)`, from, to, from, to, scope, scope)
	if err != nil {
		writeErr(w, 500, "could not load task evidence")
		return
	}
	for rows.Next() {
		var e Evidence
		if err = rows.Scan(&e.SupervisorID, &e.BoardID, &e.Added, &e.Done); err != nil {
			break
		}
		evidence = append(evidence, e)
	}
	if err == nil {
		err = rows.Err()
	}
	rows.Close()
	if err != nil {
		writeErr(w, 500, "could not read task evidence")
		return
	}
	type Participant struct {
		MeetingID  int64  `json:"meeting_id"`
		UserID     int64  `json:"user_id"`
		Name       string `json:"name"`
		Attendance string `json:"attendance"`
	}
	participants := []Participant{}
	rows, err = a.conn.Query(`SELECT mp.meeting_id,mp.user_id,u.full_name,mp.attendance_status FROM meeting_participants mp JOIN users u ON u.id=mp.user_id JOIN meetings m ON m.id=mp.meeting_id JOIN boards b ON b.id=m.board_id JOIN supervisor_files sf ON sf.id=b.supervisor_file_id WHERE (?=0 OR sf.supervisor_user_id=?) AND datetime(m.starts_at)>=datetime(?) AND datetime(m.starts_at)<datetime(?) ORDER BY u.full_name`, scope, scope, from, to)
	if err != nil {
		writeErr(w, 500, "could not load participants")
		return
	}
	for rows.Next() {
		var p Participant
		if err = rows.Scan(&p.MeetingID, &p.UserID, &p.Name, &p.Attendance); err != nil {
			break
		}
		participants = append(participants, p)
	}
	if err == nil {
		err = rows.Err()
	}
	rows.Close()
	if err != nil {
		writeErr(w, 500, "could not read participants")
		return
	}
	type Journey struct {
		SupervisorID int64  `json:"supervisor_id"`
		ID           int64  `json:"id"`
		Name         string `json:"name"`
		Start        string `json:"start"`
		End          string `json:"end"`
		InPiscine    bool   `json:"in_piscine"`
		MarkedBy     string `json:"marked_by"`
		MarkedAt     string `json:"marked_at"`
	}
	journeys := []Journey{}
	rows, err = a.conn.Query(`SELECT ss.supervisor_user_id,u.id,u.full_name,
 COALESCE((SELECT b.name FROM board_members bm JOIN boards b ON b.id=bm.board_id WHERE bm.user_id=u.id AND datetime(bm.added_at)<datetime(?) ORDER BY datetime(bm.added_at) DESC,b.id DESC LIMIT 1),''),
 COALESCE((SELECT b.name FROM board_members bm JOIN boards b ON b.id=bm.board_id WHERE bm.user_id=u.id AND datetime(bm.added_at)<datetime(?) ORDER BY datetime(bm.added_at) DESC,b.id DESC LIMIT 1),'')
  , pe.student_user_id IS NOT NULL,COALESCE(marker.full_name,''),COALESCE(pe.marked_at,'')
 FROM supervisor_students ss JOIN users u ON u.id=ss.student_user_id LEFT JOIN piscine_report_exclusions pe ON pe.student_user_id=u.id AND pe.month=? LEFT JOIN users marker ON marker.id=pe.marked_by WHERE u.is_active=1 AND (?=0 OR ss.supervisor_user_id=?) ORDER BY u.full_name`, from, to, start.Format("2006-01"), scope, scope)
	if err != nil {
		writeErr(w, 500, "could not load talent journey")
		return
	}
	for rows.Next() {
		var j Journey
		if err = rows.Scan(&j.SupervisorID, &j.ID, &j.Name, &j.Start, &j.End, &j.InPiscine, &j.MarkedBy, &j.MarkedAt); err != nil {
			break
		}
		journeys = append(journeys, j)
	}
	if err == nil {
		err = rows.Err()
	}
	rows.Close()
	if err != nil {
		writeErr(w, 500, "could not read talent journey")
		return
	}
	writeJSON(w, 200, map[string]any{"tasks": evidence, "participants": participants, "journeys": journeys})
}
