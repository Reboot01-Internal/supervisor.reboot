package handlers

import (
	"database/sql"
	"net/http"
	"strconv"
	"strings"

	"taskflow/internal/db"
	"taskflow/internal/utils"
)

type profileUser struct {
	IsActive      bool           `json:"is_active"`
	ID            int64          `json:"id"`
	FullName      string         `json:"full_name"`
	Email         string         `json:"email"`
	Nickname      string         `json:"nickname"`
	Cohort        string         `json:"cohort"`
	Role          string         `json:"role"`
	RebootDetails map[string]any `json:"reboot_details,omitempty"`
}

type profileBoardLite struct {
	ID   int64  `json:"id"`
	Name string `json:"name"`
}

type profileSupervisorStudent struct {
	IsActive bool               `json:"is_active"`
	ID       int64              `json:"id"`
	FullName string             `json:"full_name"`
	Nickname string             `json:"nickname"`
	Email    string             `json:"email"`
	Boards   []profileBoardLite `json:"boards"`
}

type profileSupervisorBoard struct {
	ID            int64  `json:"id"`
	Name          string `json:"name"`
	StudentsCount int64  `json:"students_count"`
}

type profileSupervisorSection struct {
	AssignedStudentsOverall int64                      `json:"assigned_students_overall"`
	AssignedStudents        []profileSupervisorStudent `json:"assigned_students"`
	Boards                  []profileSupervisorBoard   `json:"boards"`
}

type profileSupervisorLite struct {
	ID       int64  `json:"id"`
	FullName string `json:"full_name"`
	Nickname string `json:"nickname"`
	Email    string `json:"email"`
}

type profileStudentBoard struct {
	AddedAt    string                `json:"added_at"`
	ID         int64                 `json:"id"`
	Name       string                `json:"name"`
	Group      string                `json:"group"`
	Supervisor profileSupervisorLite `json:"supervisor"`
}

type profileStudentSection struct {
	Supervisors []profileSupervisorLite `json:"supervisors"`
	Boards      []profileStudentBoard   `json:"boards"`
}

type profileSummaryResp struct {
	User       profileUser               `json:"user"`
	Supervisor *profileSupervisorSection `json:"supervisor,omitempty"`
	Student    *profileStudentSection    `json:"student,omitempty"`
	Tasks      profileTaskSection        `json:"tasks"`
}

type addStudentPrivateNoteReq struct {
	UserID int64  `json:"user_id"`
	Body   string `json:"body"`
}

type profileTaskRow struct {
	CardID       int64  `json:"card_id"`
	CardTitle    string `json:"card_title"`
	BoardID      int64  `json:"board_id"`
	BoardName    string `json:"board_name"`
	Status       string `json:"status"`
	Priority     string `json:"priority"`
	DueDate      string `json:"due_date"`
	SubtasksDone int64  `json:"subtasks_done"`
	SubtasksAll  int64  `json:"subtasks_all"`
}

type profileTaskSection struct {
	Total         int64            `json:"total"`
	Done          int64            `json:"done"`
	Left          int64            `json:"left"`
	ProgressPct   int64            `json:"progress_pct"`
	AssignedCards []profileTaskRow `json:"assigned_cards"`
}

func (a *API) authorizeStudentPrivateNotesAccess(viewerRole string, viewerID, studentID int64) error {
	if studentID <= 0 {
		return sql.ErrNoRows
	}

	hasStudentRole, err := db.UserHasRole(a.conn, studentID, "student")
	if err != nil {
		return err
	}
	if !hasStudentRole {
		return sql.ErrNoRows
	}

	switch viewerRole {
	case "admin":
		return nil
	case "supervisor":
		allowed, err := db.IsStudentAssignedToSupervisor(a.conn, viewerID, studentID)
		if err != nil {
			return err
		}
		if !allowed {
			return sql.ErrNoRows
		}
		return nil
	default:
		return sql.ErrNoRows
	}
}

func (a *API) ProfileSummary(w http.ResponseWriter, r *http.Request) {
	uid := actorID(r, a.conn)
	var actorLogin, actorRole string
	if err := a.conn.QueryRow("SELECT IFNULL(nickname,''), role FROM users WHERE id = ?", uid).Scan(&actorLogin, &actorRole); err != nil {
		writeErr(w, http.StatusUnauthorized, "unknown user")
		return
	}
	reqRole := resolvedRole(actorLogin, actorRole)

	// Admin can inspect any user profile by id.
	if reqRole == "admin" {
		if v := strings.TrimSpace(r.URL.Query().Get("user_id")); v != "" {
			targetID, err := strconv.ParseInt(v, 10, 64)
			if err != nil || targetID <= 0 {
				writeErr(w, http.StatusBadRequest, "invalid user_id")
				return
			}
			uid = targetID
		}
	}

	// Supervisors can inspect only profiles of students assigned to them.
	if reqRole == "supervisor" {
		if v := strings.TrimSpace(r.URL.Query().Get("user_id")); v != "" {
			targetID, err := strconv.ParseInt(v, 10, 64)
			if err != nil || targetID <= 0 {
				writeErr(w, http.StatusBadRequest, "invalid user_id")
				return
			}
			var allowedID int64
			err = a.conn.QueryRow(`
				SELECT u.id
				FROM supervisor_students ss
				JOIN users u ON u.id = ss.student_user_id
				WHERE ss.supervisor_user_id = ?
				  AND ss.student_user_id = ?
				  AND LOWER(TRIM(IFNULL(u.role,''))) = 'student'
				LIMIT 1
			`, uid, targetID).Scan(&allowedID)
			if err != nil {
				if err == sql.ErrNoRows {
					writeErr(w, http.StatusForbidden, "not allowed to view this profile")
					return
				}
				writeErr(w, http.StatusInternalServerError, "failed to validate profile access")
				return
			}
			uid = allowedID
		}
	}

	var out profileSummaryResp
	err := a.conn.QueryRow(`
		SELECT id, full_name, email, IFNULL(nickname,''), IFNULL(cohort,''), role, is_active
		FROM users
		WHERE id = ?
		LIMIT 1
	`, uid).Scan(
		&out.User.ID,
		&out.User.FullName,
		&out.User.Email,
		&out.User.Nickname,
		&out.User.Cohort,
		&out.User.Role,
		&out.User.IsActive,
	)
	if err != nil {
		writeErr(w, http.StatusNotFound, "user not found")
		return
	}
	out.User.Role = strings.ToLower(strings.TrimSpace(out.User.Role))
	// Enrich only after the target profile access checks above have succeeded.
	if r.URL.Query().Get("reboot_details") == "1" {
		out.User.RebootDetails = fetchProfileDetails(r, out.User.Nickname)
	}

	hasSupervisorRole, err := db.UserHasRole(a.conn, uid, "supervisor")
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "failed to load user roles")
		return
	}
	hasStudentRole, err := db.UserHasRole(a.conn, uid, "student")
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "failed to load user roles")
		return
	}

	if hasSupervisorRole {
		section, err := a.profileForSupervisor(uid)
		if err != nil {
			writeErr(w, http.StatusInternalServerError, "failed to load supervisor profile")
			return
		}
		out.Supervisor = section
	}
	if hasStudentRole {
		section, err := a.profileForStudent(uid)
		if err != nil {
			writeErr(w, http.StatusInternalServerError, "failed to load student profile")
			return
		}
		out.Student = section
	}

	tasks, err := a.profileTasks(uid)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "failed to load task progress")
		return
	}
	out.Tasks = tasks

	writeJSON(w, http.StatusOK, out)
}

func (a *API) ListStudentPrivateNotes(w http.ResponseWriter, r *http.Request) {
	viewerID := actorID(r, a.conn)
	viewerRole := strings.TrimSpace(strings.ToLower(r.Header.Get("X-User-Role")))
	studentID, err := strconv.ParseInt(strings.TrimSpace(r.URL.Query().Get("user_id")), 10, 64)
	if err != nil || studentID <= 0 {
		writeErr(w, http.StatusBadRequest, "invalid user_id")
		return
	}

	if err := a.authorizeStudentPrivateNotesAccess(viewerRole, viewerID, studentID); err != nil {
		if err == sql.ErrNoRows {
			writeErr(w, http.StatusForbidden, "not allowed to view these notes")
			return
		}
		writeErr(w, http.StatusInternalServerError, "failed to validate notes access")
		return
	}

	notes, err := db.ListStudentPrivateNotes(a.conn, studentID, 100)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "failed to load notes")
		return
	}
	writeJSON(w, http.StatusOK, notes)
}

func (a *API) AddStudentPrivateNote(w http.ResponseWriter, r *http.Request) {
	viewerID := actorID(r, a.conn)
	viewerRole := strings.TrimSpace(strings.ToLower(r.Header.Get("X-User-Role")))
	if viewerRole != "admin" && viewerRole != "supervisor" {
		writeErr(w, http.StatusForbidden, "only admin or supervisor can add notes")
		return
	}

	var req addStudentPrivateNoteReq
	if err := utils.ReadJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "bad json")
		return
	}
	req.Body = strings.TrimSpace(req.Body)
	if req.UserID <= 0 || req.Body == "" {
		writeErr(w, http.StatusBadRequest, "user_id and body required")
		return
	}

	if err := a.authorizeStudentPrivateNotesAccess(viewerRole, viewerID, req.UserID); err != nil {
		if err == sql.ErrNoRows {
			writeErr(w, http.StatusForbidden, "not allowed to add notes for this student")
			return
		}
		writeErr(w, http.StatusInternalServerError, "failed to validate notes access")
		return
	}

	id, err := db.CreateStudentPrivateNote(a.conn, req.UserID, viewerID, req.Body)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "failed to save note")
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"id": id, "ok": true})
}

func (a *API) profileTasks(userID int64) (profileTaskSection, error) {
	out := profileTaskSection{AssignedCards: []profileTaskRow{}}

	rows, err := a.conn.Query(`
		SELECT
			c.id,
			c.title,
			b.id,
			b.name,
			LOWER(IFNULL(c.status,'')),
			LOWER(IFNULL(c.priority,'')),
			IFNULL(c.due_date,''),
			COALESCE(SUM(CASE WHEN st.is_done = 1 THEN 1 ELSE 0 END), 0) AS done_subtasks,
			COUNT(st.id) AS all_subtasks
		FROM card_assignments ca
		JOIN cards c ON c.id = ca.card_id
		JOIN lists l ON l.id = c.list_id
		JOIN boards b ON b.id = l.board_id
		LEFT JOIN card_subtasks st ON st.card_id = c.id
		WHERE ca.user_id = ?
		GROUP BY c.id, c.title, b.id, b.name, c.status, c.priority, c.due_date
		ORDER BY b.name ASC, c.id DESC
	`, userID)
	if err != nil {
		return out, err
	}
	defer rows.Close()

	for rows.Next() {
		var t profileTaskRow
		if err := rows.Scan(
			&t.CardID,
			&t.CardTitle,
			&t.BoardID,
			&t.BoardName,
			&t.Status,
			&t.Priority,
			&t.DueDate,
			&t.SubtasksDone,
			&t.SubtasksAll,
		); err != nil {
			return out, err
		}
		out.AssignedCards = append(out.AssignedCards, t)
	}

	out.Total = int64(len(out.AssignedCards))
	for _, t := range out.AssignedCards {
		if t.Status == "done" {
			out.Done++
		}
	}
	out.Left = out.Total - out.Done
	if out.Total > 0 {
		out.ProgressPct = (out.Done * 100) / out.Total
	}

	return out, nil
}

func (a *API) profileForSupervisor(supervisorID int64) (*profileSupervisorSection, error) {
	section := &profileSupervisorSection{
		AssignedStudents: []profileSupervisorStudent{},
		Boards:           []profileSupervisorBoard{},
	}

	rows, err := a.conn.Query(`
		SELECT u.id, u.full_name, IFNULL(u.nickname,''), u.email, u.is_active
		FROM supervisor_students ss
		JOIN users u ON u.id = ss.student_user_id
		WHERE ss.supervisor_user_id = ?
		ORDER BY u.full_name ASC
	`, supervisorID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var s profileSupervisorStudent
		if err := rows.Scan(&s.ID, &s.FullName, &s.Nickname, &s.Email, &s.IsActive); err != nil {
			return nil, err
		}
		s.Boards = []profileBoardLite{}

		bRows, err := a.conn.Query(`
			SELECT DISTINCT b.id, b.name
			FROM boards b
			JOIN supervisor_files sf ON sf.id = b.supervisor_file_id
			JOIN board_members bm ON bm.board_id = b.id
			WHERE sf.supervisor_user_id = ?
			  AND bm.user_id = ?
			ORDER BY b.name ASC
		`, supervisorID, s.ID)
		if err != nil {
			return nil, err
		}
		for bRows.Next() {
			var b profileBoardLite
			if err := bRows.Scan(&b.ID, &b.Name); err != nil {
				bRows.Close()
				return nil, err
			}
			s.Boards = append(s.Boards, b)
		}
		bRows.Close()

		section.AssignedStudents = append(section.AssignedStudents, s)
	}
	section.AssignedStudentsOverall = int64(len(section.AssignedStudents))

	boardRows, err := a.conn.Query(`
		SELECT
			b.id,
			b.name,
			COALESCE(SUM(CASE WHEN u.role = 'student' THEN 1 ELSE 0 END), 0) AS students_count
		FROM boards b
		JOIN supervisor_files sf ON sf.id = b.supervisor_file_id
		LEFT JOIN board_members bm ON bm.board_id = b.id
		LEFT JOIN users u ON u.id = bm.user_id
		WHERE sf.supervisor_user_id = ?
		GROUP BY b.id, b.name
		ORDER BY b.name ASC
	`, supervisorID)
	if err != nil {
		return nil, err
	}
	defer boardRows.Close()

	for boardRows.Next() {
		var b profileSupervisorBoard
		if err := boardRows.Scan(&b.ID, &b.Name, &b.StudentsCount); err != nil {
			return nil, err
		}
		section.Boards = append(section.Boards, b)
	}

	return section, nil
}

func (a *API) profileForStudent(studentID int64) (*profileStudentSection, error) {
	section := &profileStudentSection{
		Supervisors: []profileSupervisorLite{},
		Boards:      []profileStudentBoard{},
	}

	supRows, err := a.conn.Query(`
		SELECT DISTINCT u.id, u.full_name, IFNULL(u.nickname,''), u.email
		FROM supervisor_students ss
		JOIN users u ON u.id = ss.supervisor_user_id
		WHERE ss.student_user_id = ?
		ORDER BY u.full_name ASC
	`, studentID)
	if err != nil {
		return nil, err
	}
	defer supRows.Close()
	for supRows.Next() {
		var s profileSupervisorLite
		if err := supRows.Scan(&s.ID, &s.FullName, &s.Nickname, &s.Email); err != nil {
			return nil, err
		}
		section.Supervisors = append(section.Supervisors, s)
	}

	boardRows, err := a.conn.Query(`
		SELECT DISTINCT
			b.id,
			b.name,
			IFNULL(bm.added_at,''),
			IFNULL(NULLIF(TRIM(bm.role_in_board), ''), 'member'),
			su.id,
			su.full_name,
			IFNULL(su.nickname,''),
			su.email
		FROM board_members bm
		JOIN boards b ON b.id = bm.board_id
		JOIN supervisor_files sf ON sf.id = b.supervisor_file_id
		JOIN users su ON su.id = sf.supervisor_user_id
		WHERE bm.user_id = ?
		ORDER BY b.name ASC
	`, studentID)
	if err != nil {
		return nil, err
	}
	defer boardRows.Close()

	for boardRows.Next() {
		var b profileStudentBoard
		if err := boardRows.Scan(
			&b.ID,
			&b.Name,
			&b.AddedAt,
			&b.Group,
			&b.Supervisor.ID,
			&b.Supervisor.FullName,
			&b.Supervisor.Nickname,
			&b.Supervisor.Email,
		); err != nil {
			return nil, err
		}
		section.Boards = append(section.Boards, b)
	}

	return section, nil
}
