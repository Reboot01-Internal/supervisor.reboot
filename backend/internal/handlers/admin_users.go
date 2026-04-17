package handlers

import (
	// "crypto/rand"
	// "encoding/base64"
	"database/sql"
	"log"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"

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
	Nickname string `json:"nickname"`
	Cohort   string `json:"cohort"`
}

type deleteUserReq struct {
	Email string `json:"email"`
	Role  string `json:"role"`
}

type updateUserDiscordReq struct {
	UserID        int64  `json:"user_id"`
	DiscordUserID string `json:"discord_user_id"`
}

func genTempPassword() (string, error) {
	return "1111", nil
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

	existingID, _, _, existingRole, existingActive, existingNickname, existingCohort, existingErr := db.GetUserByEmailFull(a.conn, req.Email)
	if existingErr == nil && existingID > 0 {
		if !existingActive {
			writeErr(w, http.StatusForbidden, "user is inactive")
			return
		}

		hasRequestedRole, err := db.UserHasRole(a.conn, existingID, req.Role)
		if err != nil {
			writeErr(w, http.StatusInternalServerError, "db error")
			return
		}
		if hasRequestedRole {
			writeErr(w, http.StatusBadRequest, "role already added")
			return
		}

		if existingRole != "admin" {
			writeErr(w, http.StatusBadRequest, "email already exists or invalid")
			return
		}

		nicknameTaken, err := db.UserExistsByNickname(a.conn, req.Nickname)
		if err != nil {
			writeErr(w, http.StatusInternalServerError, "db error")
			return
		}
		if nicknameTaken && !strings.EqualFold(existingNickname, req.Nickname) {
			writeErr(w, http.StatusBadRequest, "nickname already exists")
			return
		}

		if req.FullName != "" && req.Email != "" && req.Nickname != "" {
			nextCohort := req.Cohort
			if nextCohort == "" {
				nextCohort = existingCohort
			}
			if err := db.UpdateUserBasics(a.conn, existingID, req.FullName, req.Email, req.Nickname, nextCohort); err != nil {
				writeErr(w, http.StatusInternalServerError, "failed to update user")
				return
			}
		}

		if err := db.AddUserRole(a.conn, existingID, req.Role); err != nil {
			writeErr(w, http.StatusInternalServerError, "failed to add role")
			return
		}
		if req.Role == "supervisor" {
			if err := db.EnsureSupervisorFile(a.conn, existingID); err != nil {
				writeErr(w, http.StatusInternalServerError, "failed to create supervisor file")
				return
			}
		}

		writeJSON(w, http.StatusOK, map[string]any{
			"id":            existingID,
			"role":          req.Role,
			"existing_user": true,
		})
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

func (a *API) AdminDeleteUser(w http.ResponseWriter, r *http.Request) {
	var req deleteUserReq
	if err := utils.ReadJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "bad json")
		return
	}

	req.Email = strings.TrimSpace(strings.ToLower(req.Email))
	req.Role = strings.TrimSpace(strings.ToLower(req.Role))
	if req.Email == "" {
		writeErr(w, http.StatusBadRequest, "email required")
		return
	}

	id, _, _, role, _, err := db.GetUserByEmail(a.conn, req.Email)
	if err != nil || id == 0 {
		writeErr(w, http.StatusNotFound, "user not found")
		return
	}

	primaryRole := strings.ToLower(strings.TrimSpace(role))
	if primaryRole == "admin" {
		if req.Role != "student" && req.Role != "supervisor" {
			writeErr(w, http.StatusBadRequest, "role is required when removing student or supervisor access from an admin")
			return
		}

		hasExtraRole, err := db.UserHasExtraRole(a.conn, id, req.Role)
		if err != nil {
			writeErr(w, http.StatusInternalServerError, "db error")
			return
		}
		if !hasExtraRole {
			writeErr(w, http.StatusNotFound, "role not found on this admin")
			return
		}

		if req.Role == "supervisor" {
			deps, err := db.CountSupervisorRoleDependencies(a.conn, id)
			if err != nil {
				writeErr(w, http.StatusInternalServerError, "db error")
				return
			}
			if deps > 0 {
				writeErr(w, http.StatusConflict, "remove supervisor workspace, members, and assignments before deleting supervisor access")
				return
			}
			if err := db.DeleteSupervisorFileByUserID(a.conn, id); err != nil {
				writeErr(w, http.StatusInternalServerError, "failed to remove supervisor workspace")
				return
			}
		}

		if req.Role == "student" {
			deps, err := db.CountStudentRoleDependencies(a.conn, id)
			if err != nil {
				writeErr(w, http.StatusInternalServerError, "db error")
				return
			}
			if deps > 0 {
				writeErr(w, http.StatusConflict, "remove student assignments, board membership, and card assignments before deleting student access")
				return
			}
		}

		if err := db.RemoveUserRole(a.conn, id, req.Role); err != nil {
			writeErr(w, http.StatusInternalServerError, "failed to remove role")
			return
		}

		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
		return
	}

	if err := db.DeleteUserByID(a.conn, id); err != nil {
		writeErr(w, http.StatusInternalServerError, "failed to delete user")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (a *API) AdminUpdateUserDiscord(w http.ResponseWriter, r *http.Request) {
	var req updateUserDiscordReq
	if err := utils.ReadJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "bad json")
		return
	}

	req.DiscordUserID = strings.TrimSpace(req.DiscordUserID)
	if req.UserID == 0 {
		writeErr(w, http.StatusBadRequest, "user_id required")
		return
	}

	if err := db.UpdateUserDiscordID(a.conn, req.UserID, req.DiscordUserID); err != nil {
		writeErr(w, http.StatusInternalServerError, "failed to update discord user id")
		return
	}

	boardRows, err := a.conn.Query(`
		SELECT board_id
		FROM board_members
		WHERE user_id = ?
	`, req.UserID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "failed to list related boards")
		return
	}
	defer boardRows.Close()

	var syncedBoards []int64
	for boardRows.Next() {
		var boardID int64
		if err := boardRows.Scan(&boardID); err != nil {
			writeErr(w, http.StatusInternalServerError, "failed to scan related boards")
			return
		}
		if a.syncBoardDiscordChannel(boardID) {
			syncedBoards = append(syncedBoards, boardID)
		}
	}
	if err := boardRows.Err(); err != nil {
		writeErr(w, http.StatusInternalServerError, "failed to iterate related boards")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"ok":             true,
		"discord_synced": len(syncedBoards) > 0,
		"synced_boards":  syncedBoards,
	})
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
		WHERE u.is_active = 1
		  AND (
		    u.role = 'supervisor'
		    OR EXISTS (
		      SELECT 1
		      FROM user_roles ur
		      WHERE ur.user_id = u.id AND ur.role = 'supervisor'
		    )
		  )
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

func (a *API) AdminSupervisorActivity(w http.ResponseWriter, r *http.Request) {
	weekOffset := 0
	if raw := strings.TrimSpace(r.URL.Query().Get("week_offset")); raw != "" {
		n, err := strconv.Atoi(raw)
		if err != nil || n < 0 {
			writeErr(w, http.StatusBadRequest, "invalid week_offset")
			return
		}
		weekOffset = n
	}

	location, err := time.LoadLocation("Asia/Bahrain")
	if err != nil {
		location = time.UTC
	}
	nowLocal := time.Now().In(location)
	startLocal := time.Date(nowLocal.Year(), nowLocal.Month(), nowLocal.Day(), 0, 0, 0, 0, location)
	startLocal = startLocal.AddDate(0, 0, -int(startLocal.Weekday()))
	startLocal = startLocal.AddDate(0, 0, -7*weekOffset)
	endLocal := startLocal.AddDate(0, 0, 7)
	startUTC := startLocal.UTC().Format("2006-01-02 15:04:05")
	endUTC := endLocal.UTC().Format("2006-01-02 15:04:05")

	row := a.conn.QueryRow(`
		WITH supervisors AS (
			SELECT u.id
			FROM users u
			WHERE
				u.role = 'supervisor'
				OR EXISTS (
					SELECT 1
					FROM user_roles ur
					WHERE ur.user_id = u.id AND ur.role = 'supervisor'
				)
		)
		SELECT
			COALESCE(SUM(
				CASE
					WHEN
						EXISTS (
							SELECT 1 FROM boards b
							WHERE b.created_by = s.id
							  AND b.created_at >= ?
							  AND b.created_at < ?
						)
						OR EXISTS (
							SELECT 1
							FROM meetings m
							WHERE m.created_by = s.id
							  AND m.created_at >= ?
							  AND m.created_at < ?
						)
						OR EXISTS (
							SELECT 1
							FROM card_activity ca
							WHERE ca.actor_user_id = s.id
							  AND ca.created_at >= ?
							  AND ca.created_at < ?
						)
					THEN 1 ELSE 0
				END
			), 0) AS active_count,
			COALESCE(SUM(
				CASE
					WHEN
						EXISTS (
							SELECT 1 FROM boards b
							WHERE b.created_by = s.id
							  AND b.created_at >= ?
							  AND b.created_at < ?
						)
						OR EXISTS (
							SELECT 1
							FROM meetings m
							WHERE m.created_by = s.id
							  AND m.created_at >= ?
							  AND m.created_at < ?
						)
						OR EXISTS (
							SELECT 1
							FROM card_activity ca
							WHERE ca.actor_user_id = s.id
							  AND ca.created_at >= ?
							  AND ca.created_at < ?
						)
					THEN 0 ELSE 1
				END
			), 0) AS inactive_count
		FROM supervisors s
	`, startUTC, endUTC, startUTC, endUTC, startUTC, endUTC, startUTC, endUTC, startUTC, endUTC, startUTC, endUTC)

	var activeCount int
	var inactiveCount int
	if err := row.Scan(&activeCount, &inactiveCount); err != nil {
		writeErr(w, http.StatusInternalServerError, "db error")
		return
	}

	total := activeCount + inactiveCount
	activePct := 0
	inactivePct := 0
	if total > 0 {
		activePct = int(math.Round((float64(activeCount) / float64(total)) * 100))
		inactivePct = 100 - activePct
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"active": map[string]any{
			"count":      activeCount,
			"percentage": activePct,
		},
		"inactive": map[string]any{
			"count":      inactiveCount,
			"percentage": inactivePct,
		},
		"total": total,
	})
}

func (a *API) AdminTaskCompletionStats(w http.ResponseWriter, r *http.Request) {
	role := normalizeRole(r.Header.Get("X-User-Role"))
	actor := actorID(r, a.conn)
	if role != "admin" && role != "supervisor" {
		writeErr(w, http.StatusForbidden, "forbidden")
		return
	}

	location, err := time.LoadLocation("Asia/Bahrain")
	if err != nil {
		location = time.UTC
	}
	today := time.Now().In(location)
	todayStart := time.Date(today.Year(), today.Month(), today.Day(), 0, 0, 0, 0, location)
	todayKey := todayStart.Format("2006-01-02")

	baseQuery := `
		WITH scoped_cards AS (
			SELECT c.id, COALESCE(NULLIF(TRIM(c.due_date), ''), '') AS due_date,
				CASE WHEN LOWER(TRIM(COALESCE(c.status, 'todo'))) = 'done' THEN 1 ELSE 0 END AS is_done
			FROM cards c
	`
	args := []any{}
	if role == "supervisor" {
		baseQuery += `
			JOIN lists l ON l.id = c.list_id
			JOIN boards b ON b.id = l.board_id
			JOIN supervisor_files sf ON sf.id = b.supervisor_file_id
			WHERE sf.supervisor_user_id = ?
		`
		args = append(args, actor)
	}
	baseQuery += `
		),
		scoped_subtasks AS (
			SELECT cs.id, COALESCE(NULLIF(TRIM(cs.due_date), ''), '') AS due_date,
				CASE WHEN COALESCE(cs.is_done, 0) = 1 THEN 1 ELSE 0 END AS is_done
			FROM card_subtasks cs
			JOIN scoped_cards c ON c.id = cs.card_id
		),
		task_items AS (
			SELECT due_date, is_done FROM scoped_cards
			UNION ALL
			SELECT due_date, is_done FROM scoped_subtasks
		)
		SELECT
			(SELECT COUNT(*) FROM scoped_cards) AS tasks_count,
			(SELECT COUNT(*) FROM scoped_subtasks) AS subtasks_count,
			COALESCE(SUM(
				CASE
					WHEN is_done = 1 THEN 1
					WHEN due_date = '' THEN 1
					WHEN due_date >= ? THEN 1
					ELSE 0
				END
			), 0) AS on_time_count,
			COALESCE(SUM(
				CASE
					WHEN is_done = 0 AND due_date <> '' AND due_date < ? THEN 1
					ELSE 0
				END
			), 0) AS overdue_count
		FROM task_items
	`
	args = append(args, todayKey, todayKey)

	row := a.conn.QueryRow(baseQuery, args...)

	var tasksCount int
	var subtasksCount int
	var onTimeCount int
	var overdueCount int
	if err := row.Scan(&tasksCount, &subtasksCount, &onTimeCount, &overdueCount); err != nil {
		log.Printf("task completion stats failed: role=%s actor=%d err=%v", role, actor, err)
		writeErr(w, http.StatusInternalServerError, "failed to load task completion: "+err.Error())
		return
	}

	totalItems := tasksCount + subtasksCount
	onTimePct := 0
	if totalItems > 0 {
		onTimePct = int(math.Round((float64(onTimeCount) / float64(totalItems)) * 100))
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"tasks": map[string]any{
			"count": tasksCount,
		},
		"subtasks": map[string]any{
			"count": subtasksCount,
		},
		"on_time": map[string]any{
			"count":      onTimeCount,
			"percentage": onTimePct,
		},
		"overdue": map[string]any{
			"count": overdueCount,
		},
		"total": totalItems,
	})
}

type createBoardReq struct {
	SupervisorFileID int64  `json:"supervisor_file_id"`
	Name             string `json:"name"`
	Description      string `json:"description"`
}

type updateBoardReq struct {
	BoardID int64  `json:"board_id"`
	Name    string `json:"name"`
}

type updateBoardStatusReq struct {
	BoardID int64  `json:"board_id"`
	Status  string `json:"status"`
}

type reassignBoardReq struct {
	BoardID          int64 `json:"board_id"`
	SupervisorUserID int64 `json:"supervisor_user_id"`
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

	role := strings.TrimSpace(strings.ToLower(r.Header.Get("X-User-Role")))
	if role == "" {
		role = "admin"
	}
	if role != "admin" && role != "supervisor" {
		writeErr(w, http.StatusForbidden, "only admin or supervisor can create board")
		return
	}

	var ownerID int64
	err := a.conn.QueryRow(`
		SELECT supervisor_user_id
		FROM supervisor_files
		WHERE id = ?
		LIMIT 1
	`, req.SupervisorFileID).Scan(&ownerID)
	if err != nil || ownerID == 0 {
		writeErr(w, http.StatusBadRequest, "invalid supervisor file")
		return
	}

	if role == "supervisor" {
		actor := actorID(r, a.conn)
		if ownerID != actor {
			writeErr(w, http.StatusForbidden, "cannot create board in another supervisor workspace")
			return
		}
	}

	createdBy := actorID(r, a.conn)
	boardID, err := db.CreateBoard(a.conn, req.SupervisorFileID, req.Name, req.Description, createdBy)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "failed to create board")
		return
	}

	_ = db.AddBoardMember(a.conn, boardID, ownerID, "owner")

	discordSynced := a.syncBoardDiscordChannel(boardID)

	writeJSON(w, http.StatusCreated, map[string]any{
		"id":             boardID,
		"discord_synced": discordSynced,
	})
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

	role := strings.TrimSpace(strings.ToLower(r.Header.Get("X-User-Role")))
	if role == "" {
		role = "admin"
	}
	if role != "admin" && role != "supervisor" {
		writeErr(w, http.StatusForbidden, "only admin or supervisor can list boards")
		return
	}
	if role == "supervisor" {
		actor := actorID(r, a.conn)
		var ownerID int64
		err := a.conn.QueryRow(`
			SELECT supervisor_user_id
			FROM supervisor_files
			WHERE id = ?
			LIMIT 1
		`, fileID).Scan(&ownerID)
		if err != nil || ownerID == 0 {
			writeErr(w, http.StatusBadRequest, "invalid file_id")
			return
		}
		if ownerID != actor {
			writeErr(w, http.StatusForbidden, "cannot access another supervisor workspace")
			return
		}
	}

	boards, err := db.ListBoardsBySupervisorFile(a.conn, fileID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "db error")
		return
	}

	writeJSON(w, http.StatusOK, boards)
}

func (a *API) AdminUpdateBoard(w http.ResponseWriter, r *http.Request) {
	var req updateBoardReq
	if err := utils.ReadJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "bad json")
		return
	}

	req.Name = strings.TrimSpace(req.Name)
	if req.BoardID == 0 || req.Name == "" {
		writeErr(w, http.StatusBadRequest, "board_id and name required")
		return
	}

	role := strings.TrimSpace(strings.ToLower(r.Header.Get("X-User-Role")))
	if role == "" {
		role = "admin"
	}
	if role != "admin" && role != "supervisor" {
		writeErr(w, http.StatusForbidden, "only admin or supervisor can update board")
		return
	}

	if role == "supervisor" {
		actor := actorID(r, a.conn)
		supID, err := db.GetBoardSupervisorUserID(a.conn, req.BoardID)
		if err != nil || supID == 0 {
			writeErr(w, http.StatusBadRequest, "invalid board")
			return
		}
		if actor != supID {
			writeErr(w, http.StatusForbidden, "not your board")
			return
		}
	}

	if err := db.UpdateBoardName(a.conn, req.BoardID, req.Name); err != nil {
		writeErr(w, http.StatusInternalServerError, "failed to update board")
		return
	}

	discordSynced := a.syncBoardDiscordChannel(req.BoardID)

	writeJSON(w, http.StatusOK, map[string]any{
		"ok":             true,
		"discord_synced": discordSynced,
	})
}

func (a *API) AdminUpdateBoardStatus(w http.ResponseWriter, r *http.Request) {
	var req updateBoardStatusReq
	if err := utils.ReadJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "bad json")
		return
	}

	req.Status = strings.TrimSpace(strings.ToLower(req.Status))
	if req.BoardID == 0 || (req.Status != "active" && req.Status != "inactive") {
		writeErr(w, http.StatusBadRequest, "board_id and valid status required")
		return
	}

	role := strings.TrimSpace(strings.ToLower(r.Header.Get("X-User-Role")))
	if role == "" {
		role = "admin"
	}
	if role != "admin" && role != "supervisor" {
		writeErr(w, http.StatusForbidden, "only admin or supervisor can update board status")
		return
	}

	if role == "supervisor" {
		actor := actorID(r, a.conn)
		supID, err := db.GetBoardSupervisorUserID(a.conn, req.BoardID)
		if err != nil || supID == 0 {
			writeErr(w, http.StatusBadRequest, "invalid board")
			return
		}
		if actor != supID {
			writeErr(w, http.StatusForbidden, "not your board")
			return
		}
	}

	if err := db.UpdateBoardStatus(a.conn, req.BoardID, req.Status); err != nil {
		writeErr(w, http.StatusInternalServerError, "failed to update board status")
		return
	}
	board, _ := db.GetBoardBasic(a.conn, req.BoardID)

	writeJSON(w, http.StatusOK, map[string]any{
		"ok":          true,
		"status":      req.Status,
		"inactive_at": board.InactiveAt,
	})
}

func (a *API) AdminReassignBoard(w http.ResponseWriter, r *http.Request) {
	var req reassignBoardReq
	if err := utils.ReadJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "bad json")
		return
	}

	if req.BoardID == 0 || req.SupervisorUserID == 0 {
		writeErr(w, http.StatusBadRequest, "board_id and supervisor_user_id required")
		return
	}

	role := strings.TrimSpace(strings.ToLower(r.Header.Get("X-User-Role")))
	if role == "" {
		role = "admin"
	}
	if role != "admin" {
		writeErr(w, http.StatusForbidden, "only admin can reassign board ownership")
		return
	}

	if _, err := db.GetBoardBasic(a.conn, req.BoardID); err != nil {
		writeErr(w, http.StatusNotFound, "board not found")
		return
	}

	targetRole, err := db.GetUserRole(a.conn, req.SupervisorUserID)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid supervisor")
		return
	}
	if !strings.EqualFold(strings.TrimSpace(targetRole), "supervisor") {
		writeErr(w, http.StatusBadRequest, "target user must be a supervisor")
		return
	}

	if err := db.EnsureSupervisorFile(a.conn, req.SupervisorUserID); err != nil {
		writeErr(w, http.StatusInternalServerError, "failed to prepare supervisor workspace")
		return
	}

	if err := db.ReassignBoardSupervisor(a.conn, req.BoardID, req.SupervisorUserID); err != nil {
		if err == sql.ErrNoRows {
			writeErr(w, http.StatusBadRequest, "invalid board or supervisor")
			return
		}
		writeErr(w, http.StatusInternalServerError, "failed to reassign board ownership")
		return
	}

	discordSynced := a.syncBoardDiscordChannel(req.BoardID)

	writeJSON(w, http.StatusOK, map[string]any{
		"ok":             true,
		"discord_synced": discordSynced,
	})
}

type deleteBoardReq struct {
	BoardID int64 `json:"board_id"`
}

func (a *API) AdminDeleteBoard(w http.ResponseWriter, r *http.Request) {
	var req deleteBoardReq
	if err := utils.ReadJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "bad json")
		return
	}
	if req.BoardID == 0 {
		writeErr(w, http.StatusBadRequest, "board_id required")
		return
	}

	role := strings.TrimSpace(strings.ToLower(r.Header.Get("X-User-Role")))
	if role == "" {
		role = "admin"
	}
	if role != "admin" && role != "supervisor" {
		writeErr(w, http.StatusForbidden, "only admin or supervisor can delete board")
		return
	}

	if role == "supervisor" {
		actor := actorID(r, a.conn)
		supID, err := db.GetBoardSupervisorUserID(a.conn, req.BoardID)
		if err != nil || supID == 0 {
			writeErr(w, http.StatusBadRequest, "invalid board")
			return
		}
		if actor != supID {
			writeErr(w, http.StatusForbidden, "not your board")
			return
		}
	}

	if _, err := db.GetBoardBasic(a.conn, req.BoardID); err != nil {
		writeErr(w, http.StatusNotFound, "board not found")
		return
	}

	if err := a.deleteBoardDiscordChannel(req.BoardID); err != nil {
		writeErr(w, http.StatusBadGateway, "failed to delete discord channel")
		return
	}

	if err := db.DeleteBoard(a.conn, req.BoardID); err != nil {
		writeErr(w, http.StatusInternalServerError, "failed to delete board")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

type addMemberReq struct {
	BoardID     int64  `json:"board_id"`
	UserID      int64  `json:"user_id"`
	RoleInBoard string `json:"role_in_board"` // member/lead/owner...
}

type removeMemberReq struct {
	BoardID int64 `json:"board_id"`
	UserID  int64 `json:"user_id"`
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

	discordSynced := a.syncBoardDiscordChannel(req.BoardID)

	writeJSON(w, http.StatusOK, map[string]any{
		"ok":             true,
		"discord_synced": discordSynced,
	})
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

func (a *API) AdminRemoveBoardMember(w http.ResponseWriter, r *http.Request) {
	var req removeMemberReq
	if err := utils.ReadJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "bad json")
		return
	}
	if req.BoardID == 0 || req.UserID == 0 {
		writeErr(w, http.StatusBadRequest, "board_id and user_id required")
		return
	}

	role := strings.TrimSpace(strings.ToLower(r.Header.Get("X-User-Role")))
	if role == "" {
		role = "admin"
	}
	if role != "admin" && role != "supervisor" {
		writeErr(w, http.StatusForbidden, "only admin or supervisor can remove members")
		return
	}

	boardSupID, err := db.GetBoardSupervisorUserID(a.conn, req.BoardID)
	if err != nil || boardSupID == 0 {
		writeErr(w, http.StatusBadRequest, "board has no supervisor")
		return
	}

	if role == "supervisor" {
		actor := actorID(r, a.conn)
		if actor != boardSupID {
			writeErr(w, http.StatusForbidden, "not your board")
			return
		}
	}

	if req.UserID == boardSupID {
		writeErr(w, http.StatusForbidden, "cannot remove board supervisor")
		return
	}

	memberRole, err := db.GetBoardMemberRole(a.conn, req.BoardID, req.UserID)
	if err == sql.ErrNoRows {
		writeErr(w, http.StatusNotFound, "member not found")
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "db error")
		return
	}
	if strings.EqualFold(strings.TrimSpace(memberRole), "owner") {
		writeErr(w, http.StatusForbidden, "cannot remove board owner")
		return
	}

	ok, err := db.DeleteBoardMember(a.conn, req.BoardID, req.UserID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "failed to remove member")
		return
	}
	if !ok {
		writeErr(w, http.StatusNotFound, "member not found")
		return
	}

	discordSynced := a.syncBoardDiscordChannel(req.BoardID)

	writeJSON(w, http.StatusOK, map[string]any{
		"ok":             true,
		"discord_synced": discordSynced,
	})
}

func (a *API) AdminAllBoards(w http.ResponseWriter, r *http.Request) {
	role := strings.TrimSpace(strings.ToLower(r.Header.Get("X-User-Role")))
	if role == "" {
		role = "admin"
	}
	actor := actorID(r, a.conn)

	var rows *sql.Rows
	var err error

	switch role {
	case "admin":
		rows, err = a.conn.Query(`
		SELECT 
			b.id,
			b.name,
			b.description,
			IFNULL(b.status, 'active'),
			IFNULL(b.inactive_at, ''),
			u.full_name,
			sf.supervisor_user_id,
			sf.id,
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
	case "supervisor":
		rows, err = a.conn.Query(`
		SELECT 
			b.id,
			b.name,
			b.description,
			IFNULL(b.status, 'active'),
			IFNULL(b.inactive_at, ''),
			u.full_name,
			sf.supervisor_user_id,
			sf.id,
			b.created_at,
			COUNT(DISTINCT l.id) as lists_count,
			COUNT(DISTINCT c.id) as cards_count
		FROM boards b
		JOIN supervisor_files sf ON sf.id = b.supervisor_file_id
		JOIN users u ON u.id = sf.supervisor_user_id
		LEFT JOIN lists l ON l.board_id = b.id
		LEFT JOIN cards c ON c.list_id = l.id
		WHERE sf.supervisor_user_id = ?
		GROUP BY b.id
		ORDER BY b.created_at DESC
	`, actor)
	case "student":
		rows, err = a.conn.Query(`
		SELECT 
			b.id,
			b.name,
			b.description,
			IFNULL(b.status, 'active'),
			IFNULL(b.inactive_at, ''),
			u.full_name,
			sf.supervisor_user_id,
			sf.id,
			b.created_at,
			COUNT(DISTINCT l.id) as lists_count,
			COUNT(DISTINCT c.id) as cards_count
		FROM boards b
		JOIN board_members bm ON bm.board_id = b.id
		JOIN supervisor_files sf ON sf.id = b.supervisor_file_id
		JOIN users u ON u.id = sf.supervisor_user_id
		LEFT JOIN lists l ON l.board_id = b.id
		LEFT JOIN cards c ON c.list_id = l.id
		WHERE bm.user_id = ?
		GROUP BY b.id
		ORDER BY b.created_at DESC
	`, actor)
	default:
		writeErr(w, http.StatusForbidden, "forbidden")
		return
	}
	if err != nil {
		writeErr(w, 500, "db error")
		return
	}
	defer rows.Close()

	type Row struct {
		ID               int64  `json:"id"`
		Name             string `json:"name"`
		Description      string `json:"description"`
		Status           string `json:"status"`
		InactiveAt       string `json:"inactive_at"`
		Supervisor       string `json:"supervisor_name"`
		SupervisorUserID int64  `json:"supervisor_user_id"`
		SupervisorFileID int64  `json:"supervisor_file_id"`
		CreatedAt        string `json:"created_at"`
		ListsCount       int64  `json:"lists_count"`
		CardsCount       int64  `json:"cards_count"`
	}

	var out []Row
	for rows.Next() {
		var rr Row
		if err := rows.Scan(
			&rr.ID, &rr.Name, &rr.Description, &rr.Status, &rr.InactiveAt, &rr.Supervisor,
			&rr.SupervisorUserID, &rr.SupervisorFileID,
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
	role := strings.TrimSpace(strings.ToLower(r.URL.Query().Get("role")))

	if email == "" && nickname == "" {
		writeErr(w, http.StatusBadRequest, "email or nickname required")
		return
	}

	out := map[string]any{
		"exists":     false,
		"any_exists": false,
	}

	if email != "" {
		exists, err := db.UserExistsByEmail(a.conn, email)
		if err != nil {
			writeErr(w, http.StatusInternalServerError, "db error")
			return
		}
		out["any_exists"] = exists
		out["exists"] = exists
		if role == "student" || role == "supervisor" {
			roleExists, err := db.UserRoleExistsByEmail(a.conn, email, role)
			if err != nil {
				writeErr(w, http.StatusInternalServerError, "db error")
				return
			}
			out["exists"] = roleExists
			out["role_exists"] = roleExists
		}
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
