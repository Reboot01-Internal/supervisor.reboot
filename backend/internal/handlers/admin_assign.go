package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strings"
)

type assignUser struct {
	ID       int    `json:"id"`
	FullName string `json:"full_name"`
	Nickname string `json:"nickname"`
	Email    string `json:"email"`
	Cohort   string `json:"cohort"`
	Role     string `json:"role,omitempty"`
}

type assignBody struct {
	SupervisorID int `json:"supervisor_id"`
	StudentID    int `json:"student_id"`
}


func (api *API) AdminAssignListSupervisors(w http.ResponseWriter, r *http.Request) {
	rows, err := api.conn.Query(`
		SELECT u.id, u.full_name, u.nickname, u.email, IFNULL(u.cohort,''), 'supervisor'
		FROM users u
		WHERE u.is_active=1
		  AND (
		    u.role='supervisor'
		    OR EXISTS (
		      SELECT 1
		      FROM user_roles ur
		      WHERE ur.user_id = u.id AND ur.role = 'supervisor'
		    )
		  )
		ORDER BY u.full_name ASC
	`)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	defer rows.Close()

	out := []assignUser{}
	for rows.Next() {
		var u assignUser
		if err := rows.Scan(&u.ID, &u.FullName, &u.Nickname, &u.Email, &u.Cohort, &u.Role); err != nil {
			writeErr(w, 500, err.Error())
			return
		}
		out = append(out, u)
	}

	writeJSON(w, 200, out)
}

/*
GET /admin/assign/students?q=
Returns all active students (optionally filtered by q)
*/
func (api *API) AdminAssignListStudents(w http.ResponseWriter, r *http.Request) {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	qLike := "%" + strings.ToLower(q) + "%"

	var rows *sql.Rows
	var err error

	if q == "" {
		rows, err = api.conn.Query(`
    SELECT u.id, u.full_name, u.nickname, u.email, IFNULL(u.cohort,''), 'student'
    FROM users u
    WHERE u.is_active=1
      AND (
        u.role='student'
        OR EXISTS (
          SELECT 1
          FROM user_roles ur
          WHERE ur.user_id = u.id AND ur.role = 'student'
        )
      )
      AND NOT EXISTS (
        SELECT 1 FROM supervisor_students ss
        WHERE ss.student_user_id = u.id
      )
    ORDER BY u.full_name ASC
  `)
	} else {
		rows, err = api.conn.Query(`
    SELECT u.id, u.full_name, u.nickname, u.email, IFNULL(u.cohort,''), 'student'
    FROM users u
    WHERE u.is_active=1
      AND (
        u.role='student'
        OR EXISTS (
          SELECT 1
          FROM user_roles ur
          WHERE ur.user_id = u.id AND ur.role = 'student'
        )
      )
      AND NOT EXISTS (
        SELECT 1 FROM supervisor_students ss
        WHERE ss.student_user_id = u.id
      )
      AND (
        LOWER(u.full_name) LIKE ?
        OR LOWER(u.email) LIKE ?
        OR LOWER(u.nickname) LIKE ?
      )
    ORDER BY u.full_name ASC
    LIMIT 200
  `, qLike, qLike, qLike)
	}

	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	defer rows.Close()

	out := []assignUser{}
	for rows.Next() {
		var u assignUser
		if err := rows.Scan(&u.ID, &u.FullName, &u.Nickname, &u.Email, &u.Cohort, &u.Role); err != nil {
			writeErr(w, 500, err.Error())
			return
		}
		out = append(out, u)
	}
	writeJSON(w, 200, out)
}

/*
GET /admin/assign/list?supervisor_id=#
Returns students assigned to supervisor
*/
func (api *API) AdminAssignList(w http.ResponseWriter, r *http.Request) {
	sid := strings.TrimSpace(r.URL.Query().Get("supervisor_id"))
	if sid == "" {
		writeErr(w, 400, "supervisor_id is required")
		return
	}

	rows, err := api.conn.Query(`
SELECT u.id, u.full_name, u.nickname, u.email, IFNULL(u.cohort,'')
		FROM supervisor_students ss
		JOIN users u ON u.id = ss.student_user_id
		WHERE ss.supervisor_user_id = ?
		ORDER BY u.full_name ASC
	`, sid)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	defer rows.Close()

	out := []assignUser{}
	for rows.Next() {
		var u assignUser
		if err := rows.Scan(&u.ID, &u.FullName, &u.Nickname, &u.Email, &u.Cohort); err != nil {
			writeErr(w, 500, err.Error())
			return
		}
		out = append(out, u)
	}
	writeJSON(w, 200, out)
}

/*
POST /admin/assign
Body: { supervisor_id, student_id }
Assign student to supervisor
*/
func (api *API) AdminAssignAdd(w http.ResponseWriter, r *http.Request) {
	var body assignBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErr(w, 400, "invalid json")
		return
	}
	if body.SupervisorID == 0 || body.StudentID == 0 {
		writeErr(w, 400, "supervisor_id and student_id are required")
		return
	}

	var existingSupervisorID int
	err := api.conn.QueryRow(`
		SELECT supervisor_user_id
		FROM supervisor_students
		WHERE student_user_id = ?
		LIMIT 1
	`, body.StudentID).Scan(&existingSupervisorID)
	if err != nil && err != sql.ErrNoRows {
		writeErr(w, 500, err.Error())
		return
	}
	if err == nil {
		if existingSupervisorID == body.SupervisorID {
			writeJSON(w, 200, map[string]any{"ok": true})
			return
		}
		writeErr(w, 409, "student already assigned to another supervisor")
		return
	}

	_, err = api.conn.Exec(`
		INSERT OR IGNORE INTO supervisor_students(supervisor_user_id, student_user_id)
		VALUES(?, ?)
	`, body.SupervisorID, body.StudentID)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}

	writeJSON(w, 200, map[string]any{"ok": true})
}

func (api *API) AdminAssignRemove(w http.ResponseWriter, r *http.Request) {
	var body assignBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErr(w, 400, "invalid json")
		return
	}
	if body.SupervisorID == 0 || body.StudentID == 0 {
		writeErr(w, 400, "supervisor_id and student_id are required")
		return
	}

	_, err := api.conn.Exec(`
		DELETE FROM supervisor_students
		WHERE supervisor_user_id=? AND student_user_id=?
	`, body.SupervisorID, body.StudentID)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}

	writeJSON(w, 200, map[string]any{"ok": true})
}
