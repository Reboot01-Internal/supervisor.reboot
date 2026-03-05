package handlers

import (
	// "crypto/rand"
	// "encoding/base64"
	"net/http"
	"strconv"
	"strings"

	"taskflow/internal/auth"
	"taskflow/internal/db"

	// "taskflow/internal/middleware"
	"taskflow/internal/models"
	"taskflow/internal/utils"
)

type createUserReq struct {
	FullName string `json:"full_name"`
	Email    string `json:"email"`
	Password string `json:"password"`
	Role     string `json:"role"` // supervisor|student
	Nickname  string `json:"nickname"`  
	Cohort    string `json:"cohort"` 
}
func genTempPassword() (string, error) {
return "1111",nil
}


func (a *API) AdminCreateUser(w http.ResponseWriter, r *http.Request) {
	var req createUserReq
	if err := utils.ReadJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "bad json")
		return
	}

	req.Email = strings.TrimSpace(strings.ToLower(req.Email))
	req.FullName = strings.TrimSpace(req.FullName)
	req.Password = strings.TrimSpace(req.Password)
	req.Role = strings.TrimSpace(strings.ToLower(req.Role))
	req.Nickname = strings.TrimSpace(req.Nickname)
	req.Cohort = strings.TrimSpace(req.Cohort)

	if req.Nickname == "" {
		writeErr(w, http.StatusBadRequest, "nickname required")
		return
	}

	if req.FullName == "" || req.Email == "" {
		writeErr(w, http.StatusBadRequest, "full_name and email required")
		return
	}
	if req.Role != "supervisor" && req.Role != "student" {
		writeErr(w, http.StatusBadRequest, "role must be supervisor or student")
		return
	}

	// ✅ block duplicates by nickname too
	if ok, err := db.UserExistsByNickname(a.conn, req.Nickname); err == nil && ok {
		writeErr(w, http.StatusBadRequest, "nickname already exists")
		return
	}

	// ✅ password: generate if empty
	tempPassword := ""
	passToHash := req.Password
	if passToHash == "" {
		p, err := genTempPassword()
		if err != nil {
			writeErr(w, http.StatusInternalServerError, "failed to generate password")
			return
		}
		tempPassword = p
		passToHash = p
	}

	passHash, err := auth.HashPassword(passToHash)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "password hash error")
		return
	}

	userID, err := db.CreateUser(a.conn, req.FullName, req.Email, passHash, req.Role, req.Nickname, req.Cohort)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "email already exists or invalid")
		return
	}

	if req.Role == "supervisor" {
		if err := db.EnsureSupervisorFile(a.conn, userID); err != nil {
			writeErr(w, http.StatusInternalServerError, "failed to create supervisor file")
			return
		}
	}

	resp := map[string]any{
		"id":   userID,
		"role": req.Role,
	}
	if tempPassword != "" {
		resp["temp_password"] = tempPassword
	}
	writeJSON(w, http.StatusCreated, resp)
}


func (a *API) AdminListSupervisors(w http.ResponseWriter, r *http.Request) {
	rows, err := a.conn.Query(`
		SELECT
			u.id,
			u.full_name,
			u.email,
			IFNULL(u.nickname,''),
			IFNULL(u.cohort,''),
			sf.id,
			sf.created_at
		FROM users u
		JOIN supervisor_files sf ON sf.supervisor_user_id = u.id
		WHERE u.role = 'supervisor' AND u.is_active = 1
		ORDER BY u.full_name ASC
	`)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "db error")
		return
	}
	defer rows.Close()

	out := []models.SupervisorRow{}
	for rows.Next() {
		var s models.SupervisorRow
		if err := rows.Scan(
			&s.SupervisorUserID,
			&s.FullName,
			&s.Email,
			&s.Nickname,
			&s.Cohort,
			&s.FileID,
			&s.CreatedAt,
		); err != nil {
			writeErr(w, http.StatusInternalServerError, "scan error")
			return
		}
		out = append(out, s)
	}

	writeJSON(w, http.StatusOK, out)
}

type createBoardReq struct {
	SupervisorFileID int64  `json:"supervisor_file_id"`
	Name             string `json:"name"`
	Description      string `json:"description"`
}

func (a *API) AdminCreateBoard(w http.ResponseWriter, r *http.Request) {
	var req createBoardReq
	if err := utils.ReadJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "bad json")
		return
	}

	req.Name = strings.TrimSpace(req.Name)
	req.Description = strings.TrimSpace(req.Description)

	if req.SupervisorFileID == 0 || req.Name == "" {
		writeErr(w, http.StatusBadRequest, "supervisor_file_id and name required")
		return
	}

	createdBy := actorID(r, a.conn)
	boardID, err := db.CreateBoard(a.conn, req.SupervisorFileID, req.Name, req.Description, createdBy)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "failed to create board")
		return
	}

	_ = db.AddBoardMember(a.conn, boardID, createdBy, "owner")

	writeJSON(w, http.StatusCreated, map[string]any{"id": boardID})
}

func (a *API) AdminListBoardsByFile(w http.ResponseWriter, r *http.Request) {
	fileIDStr := r.URL.Query().Get("file_id")
	if fileIDStr == "" {
		writeErr(w, http.StatusBadRequest, "file_id is required")
		return
	}

	fileID, err := strconv.ParseInt(fileIDStr, 10, 64)
	if err != nil || fileID <= 0 {
		writeErr(w, http.StatusBadRequest, "invalid file_id")
		return
	}

	boards, err := db.ListBoardsBySupervisorFile(a.conn, fileID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "db error")
		return
	}

	writeJSON(w, http.StatusOK, boards)
}

type addMemberReq struct {
	BoardID     int64  `json:"board_id"`
	UserID      int64  `json:"user_id"`
	RoleInBoard string `json:"role_in_board"` // member/lead/owner...
}

func (a *API) AdminAddBoardMember(w http.ResponseWriter, r *http.Request) {
	var req addMemberReq
	if err := utils.ReadJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "bad json")
		return
	}

	if req.BoardID == 0 || req.UserID == 0 {
		writeErr(w, http.StatusBadRequest, "board_id and user_id required")
		return
	}

	// board must have a supervisor
	boardSupID, err := db.GetBoardSupervisorUserID(a.conn, req.BoardID)
	if err != nil || boardSupID == 0 {
		writeErr(w, http.StatusBadRequest, "board has no supervisor")
		return
	}

	targetRole, err := db.GetUserRole(a.conn, req.UserID)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid user")
		return
	}

	tr := strings.ToLower(strings.TrimSpace(targetRole))
	if tr != "student" && tr != "supervisor" {
		writeErr(w, http.StatusForbidden, "only students or supervisors can be added")
		return
	}

	// only students require assignment check
	if tr == "student" {
		ok, err := db.IsStudentAssignedToSupervisor(a.conn, boardSupID, req.UserID)
		if err != nil {
			writeErr(w, http.StatusInternalServerError, "db error")
			return
		}
		if !ok {
			writeErr(w, http.StatusForbidden, "student not assigned to this supervisor")
			return
		}
	}

	req.RoleInBoard = strings.TrimSpace(req.RoleInBoard)
	if req.RoleInBoard == "" {
		req.RoleInBoard = "member"
	}

	if err := db.AddBoardMember(a.conn, req.BoardID, req.UserID, req.RoleInBoard); err != nil {
		writeErr(w, http.StatusInternalServerError, "failed to add member")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (a *API) AdminListBoardMembers(w http.ResponseWriter, r *http.Request) {
	boardIDStr := r.URL.Query().Get("board_id")
	if boardIDStr == "" {
		writeErr(w, http.StatusBadRequest, "board_id is required")
		return
	}

	boardID, err := strconv.ParseInt(boardIDStr, 10, 64)
	if err != nil || boardID <= 0 {
		writeErr(w, http.StatusBadRequest, "invalid board_id")
		return
	}

	members, err := db.ListBoardMembers(a.conn, boardID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "db error")
		return
	}

	writeJSON(w, http.StatusOK, members)
}

func (a *API) AdminAllBoards(w http.ResponseWriter, r *http.Request) {
	rows, err := a.conn.Query(`
		SELECT 
			b.id,
			b.name,
			b.description,
			u.full_name,
			b.created_at,
			COUNT(DISTINCT l.id) as lists_count,
			COUNT(DISTINCT c.id) as cards_count
		FROM boards b
		JOIN supervisor_files sf ON sf.id = b.supervisor_file_id
		JOIN users u ON u.id = sf.supervisor_user_id
		LEFT JOIN lists l ON l.board_id = b.id
		LEFT JOIN cards c ON c.list_id = l.id
		GROUP BY b.id
		ORDER BY b.created_at DESC
	`)
	if err != nil {
		writeErr(w, 500, "db error")
		return
	}
	defer rows.Close()

	type Row struct {
		ID          int64  `json:"id"`
		Name        string `json:"name"`
		Description string `json:"description"`
		Supervisor  string `json:"supervisor_name"`
		CreatedAt   string `json:"created_at"`
		ListsCount  int64  `json:"lists_count"`
		CardsCount  int64  `json:"cards_count"`
	}

	var out []Row
	for rows.Next() {
		var rr Row
		if err := rows.Scan(
			&rr.ID, &rr.Name, &rr.Description, &rr.Supervisor,
			&rr.CreatedAt, &rr.ListsCount, &rr.CardsCount,
		); err != nil {
			writeErr(w, 500, "scan error")
			return
		}
		out = append(out, rr)
	}

	writeJSON(w, 200, out)
}

func (a *API) AdminSearchUsers(w http.ResponseWriter, r *http.Request) {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	role := strings.TrimSpace(strings.ToLower(r.URL.Query().Get("role")))

	// default: all (students + supervisors)
	if role == "" || role == "all" {
		users, err := db.SearchUsersStudentsAndSupervisors(a.conn, q)
		if err != nil {
			writeErr(w, http.StatusInternalServerError, "db error")
			return
		}
		writeJSON(w, http.StatusOK, users)
		return
	}

	if role != "student" && role != "supervisor" {
		writeErr(w, http.StatusBadRequest, "role must be all, student, or supervisor")
		return
	}

	users, err := db.SearchUsersByRole(a.conn, role, q)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "db error")
		return
	}

	writeJSON(w, http.StatusOK, users)
}
func (a *API) AdminEligibleUsers(w http.ResponseWriter, r *http.Request) {
	boardIDStr := r.URL.Query().Get("board_id")
	role := strings.TrimSpace(strings.ToLower(r.URL.Query().Get("role")))
	q := strings.TrimSpace(r.URL.Query().Get("q"))

	boardID, err := strconv.ParseInt(boardIDStr, 10, 64)
	if err != nil || boardID <= 0 {
		writeErr(w, http.StatusBadRequest, "invalid board_id")
		return
	}

	// current board members -> exclude them from results
	members, err := db.ListBoardMembers(a.conn, boardID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "db error")
		return
	}
	inBoard := map[int64]bool{}
	for _, m := range members {
		inBoard[m.UserID] = true
	}

	// board supervisor -> used to determine eligible students
	supID, err := db.GetBoardSupervisorUserID(a.conn, boardID)
	if err != nil || supID == 0 {
		writeErr(w, http.StatusBadRequest, "board has no supervisor")
		return
	}

	out := []models.User{}

	// include supervisors (if role=all or supervisor)
	if role == "" || role == "all" || role == "supervisor" {
		sups, err := db.SearchUsersByRole(a.conn, "supervisor", q)
		if err != nil {
			writeErr(w, http.StatusInternalServerError, "db error")
			return
		}
		for _, u := range sups {
			if !inBoard[u.ID] {
				out = append(out, u)
			}
		}
	}

	// include students (if role=all or student)
	if role == "" || role == "all" || role == "student" {
		studs, err := db.ListEligibleStudentsForSupervisor(a.conn, supID, q)
		if err != nil {
			writeErr(w, http.StatusInternalServerError, "db error")
			return
		}
		for _, u := range studs {
			if !inBoard[u.ID] {
				out = append(out, u)
			}
		}
	}

	writeJSON(w, http.StatusOK, out)
}
func (a *API) AdminUserExists(w http.ResponseWriter, r *http.Request) {
	email := strings.TrimSpace(r.URL.Query().Get("email"))
	nickname := strings.TrimSpace(r.URL.Query().Get("nickname"))

	if email == "" && nickname == "" {
		writeErr(w, http.StatusBadRequest, "email or nickname required")
		return
	}

	out := map[string]any{"exists": false}

	if email != "" {
		exists, err := db.UserExistsByEmail(a.conn, email)
		if err != nil {
			writeErr(w, http.StatusInternalServerError, "db error")
			return
		}
		out["exists"] = exists
		returnJSON(w, out)
		return
	}

	exists, err := db.UserExistsByNickname(a.conn, nickname)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "db error")
		return
	}
	out["exists"] = exists
	returnJSON(w, out)
}

func returnJSON(w http.ResponseWriter, payload map[string]any) {
	writeJSON(w, http.StatusOK, payload)
}
