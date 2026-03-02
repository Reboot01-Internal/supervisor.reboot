package handlers

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"taskflow/internal/auth"
	"taskflow/internal/db"
	"taskflow/internal/middleware"
	"taskflow/internal/models"
	"taskflow/internal/utils"
)

/*
ADMIN: Create user (supervisor/student)
POST /admin/users
*/
type createUserReq struct {
	FullName string `json:"full_name"`
	Email    string `json:"email"`
	Password string `json:"password"`
	Role     string `json:"role"` // supervisor|student
}

func (a *API) AdminCreateUser(w http.ResponseWriter, r *http.Request) {
	var req createUserReq
	if err := utils.ReadJSON(r, &req); err != nil {
		utils.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "bad json"})
		return
	}

	req.Email = strings.TrimSpace(strings.ToLower(req.Email))
	req.FullName = strings.TrimSpace(req.FullName)
	req.Password = strings.TrimSpace(req.Password)
	req.Role = strings.TrimSpace(strings.ToLower(req.Role))

	if req.FullName == "" || req.Email == "" || req.Password == "" {
		utils.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "full_name, email, password required"})
		return
	}

	if req.Role != "supervisor" && req.Role != "student" {
		utils.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "role must be supervisor or student"})
		return
	}

	passHash, err := auth.HashPassword(req.Password)
	if err != nil {
		utils.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": "password hash error"})
		return
	}

	userID, err := db.CreateUser(a.conn, req.FullName, req.Email, passHash, req.Role)
	if err != nil {
		utils.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "email already exists or invalid"})
		return
	}

	// auto-create supervisor file
	if req.Role == "supervisor" {
		if err := db.EnsureSupervisorFile(a.conn, userID); err != nil {
			utils.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": "failed to create supervisor file"})
			return
		}
	}

	utils.WriteJSON(w, http.StatusCreated, map[string]any{
		"id":   userID,
		"role": req.Role,
	})
}

/*
ADMIN: List supervisors (with file id)
GET /admin/supervisors
*/
func (a *API) AdminListSupervisors(w http.ResponseWriter, r *http.Request) {
	rows, err := a.conn.Query(`
		SELECT u.id, u.full_name, u.email, sf.id, sf.created_at
		FROM users u
		JOIN supervisor_files sf ON sf.supervisor_user_id = u.id
		WHERE u.role = 'supervisor' AND u.is_active = 1
		ORDER BY u.full_name ASC
	`)
	if err != nil {
		utils.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": "db error"})
		return
	}
	defer rows.Close()

	out := []models.SupervisorRow{}
	for rows.Next() {
		var s models.SupervisorRow
		if err := rows.Scan(&s.SupervisorUserID, &s.FullName, &s.Email, &s.FileID, &s.CreatedAt); err != nil {
			utils.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": "scan error"})
			return
		}
		out = append(out, s)
	}

	utils.WriteJSON(w, http.StatusOK, out)
}

/*
ADMIN: Create board inside a supervisor file
POST /admin/boards
*/
type createBoardReq struct {
	SupervisorFileID int64  `json:"supervisor_file_id"`
	Name             string `json:"name"`
	Description      string `json:"description"`
}

func (a *API) AdminCreateBoard(w http.ResponseWriter, r *http.Request) {
	var req createBoardReq
	if err := utils.ReadJSON(r, &req); err != nil {
		utils.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "bad json"})
		return
	}

	req.Name = strings.TrimSpace(req.Name)
	req.Description = strings.TrimSpace(req.Description)

	if req.SupervisorFileID == 0 || req.Name == "" {
		utils.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "supervisor_file_id and name required"})
		return
	}

	createdBy := middleware.UserID(r)
	boardID, err := db.CreateBoard(a.conn, req.SupervisorFileID, req.Name, req.Description, createdBy)
	if err != nil {
		utils.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": "failed to create board"})
		return
	}

	// Optional: auto-add creator as member (admin)
	_ = db.AddBoardMember(a.conn, boardID, createdBy, "owner")

	utils.WriteJSON(w, http.StatusCreated, map[string]any{"id": boardID})
}

/*
ADMIN: List boards by supervisor file
GET /admin/boards?file_id=123
*/
func (a *API) AdminListBoardsByFile(w http.ResponseWriter, r *http.Request) {
	fileIDStr := r.URL.Query().Get("file_id")
	if fileIDStr == "" {
		utils.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "file_id is required"})
		return
	}

	fileID, err := strconv.ParseInt(fileIDStr, 10, 64)
	if err != nil || fileID <= 0 {
		utils.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid file_id"})
		return
	}

	boards, err := db.ListBoardsBySupervisorFile(a.conn, fileID)
	if err != nil {
		utils.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": "db error"})
		return
	}

	utils.WriteJSON(w, http.StatusOK, boards)
}

/*
ADMIN: Add/Update board member
POST /admin/board-members
*/
type addMemberReq struct {
	BoardID     int64  `json:"board_id"`
	UserID      int64  `json:"user_id"`
	RoleInBoard string `json:"role_in_board"` // member/lead/owner...
}

func (a *API) AdminAddBoardMember(w http.ResponseWriter, r *http.Request) {
	var req addMemberReq
	if err := utils.ReadJSON(r, &req); err != nil {
		utils.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "bad json"})
		return
	}

	if req.BoardID == 0 || req.UserID == 0 {
		utils.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "board_id and user_id required"})
		return
	}

	req.RoleInBoard = strings.TrimSpace(req.RoleInBoard)
	if req.RoleInBoard == "" {
		req.RoleInBoard = "member"
	}

	if err := db.AddBoardMember(a.conn, req.BoardID, req.UserID, req.RoleInBoard); err != nil {
		utils.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": "failed to add member"})
		return
	}

	utils.WriteJSON(w, http.StatusOK, map[string]any{"ok": true})
}

/*
ADMIN: List board members
GET /admin/board-members?board_id=55
*/
func (a *API) AdminListBoardMembers(w http.ResponseWriter, r *http.Request) {
	boardIDStr := r.URL.Query().Get("board_id")
	if boardIDStr == "" {
		utils.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "board_id is required"})
		return
	}

	boardID, err := strconv.ParseInt(boardIDStr, 10, 64)
	if err != nil || boardID <= 0 {
		utils.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid board_id"})
		return
	}

	members, err := db.ListBoardMembers(a.conn, boardID)
	if err != nil {
		utils.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": "db error"})
		return
	}

	utils.WriteJSON(w, http.StatusOK, members)
}

/*
ADMIN: Search students
GET /admin/students?q=reem
*/
func (a *API) AdminSearchStudents(w http.ResponseWriter, r *http.Request) {
	q := strings.TrimSpace(r.URL.Query().Get("q"))

	users, err := db.SearchUsersByRole(a.conn, "student", q)
	if err != nil {
		utils.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": "db error"})
		return
	}

	utils.WriteJSON(w, http.StatusOK, users)
}
type createLabelReq struct {
	BoardID int64  `json:"board_id"`
	Name    string `json:"name"`
	Color   string `json:"color"`
}

func (a *API) AdminCreateLabel(w http.ResponseWriter, r *http.Request) {
	var req createLabelReq
	if err := utils.ReadJSON(r, &req); err != nil {
		utils.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "bad json"})
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	req.Color = strings.TrimSpace(strings.ToLower(req.Color))

	if req.BoardID == 0 || req.Name == "" {
		utils.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "board_id and name required"})
		return
	}

	id, err := db.CreateLabel(a.conn, req.BoardID, req.Name, req.Color)
	if err != nil {
		utils.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "failed to create label (maybe duplicate?)"})
		return
	}

	utils.WriteJSON(w, http.StatusCreated, map[string]any{"id": id})
}

func (a *API) AdminListLabels(w http.ResponseWriter, r *http.Request) {
	boardIDStr := r.URL.Query().Get("board_id")
	if boardIDStr == "" {
		utils.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "board_id required"})
		return
	}
	boardID, err := strconv.ParseInt(boardIDStr, 10, 64)
	if err != nil || boardID <= 0 {
		utils.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid board_id"})
		return
	}

	labels, err := db.ListLabelsByBoard(a.conn, boardID)
	if err != nil {
		utils.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": "db error"})
		return
	}
	utils.WriteJSON(w, http.StatusOK, labels)
}

type cardLabelReq struct {
	CardID  int64 `json:"card_id"`
	LabelID int64 `json:"label_id"`
}

func (a *API) AdminAddCardLabel(w http.ResponseWriter, r *http.Request) {
	var req cardLabelReq
	if err := utils.ReadJSON(r, &req); err != nil {
		utils.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "bad json"})
		return
	}
	if req.CardID == 0 || req.LabelID == 0 {
		utils.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "card_id and label_id required"})
		return
	}
	if err := db.AddLabelToCard(a.conn, req.CardID, req.LabelID); err != nil {
		utils.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": "failed"})
		return
	}
	actor := middleware.UserID(r)
	_ = db.InsertCardActivity(a.conn, req.CardID, actor, "label_added", "label_id="+strconv.FormatInt(req.LabelID,10))
	utils.WriteJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (a *API) AdminRemoveCardLabel(w http.ResponseWriter, r *http.Request) {
	var req cardLabelReq
	if err := utils.ReadJSON(r, &req); err != nil {
		utils.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "bad json"})
		return
	}
	if req.CardID == 0 || req.LabelID == 0 {
		utils.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "card_id and label_id required"})
		return
	}
	if err := db.RemoveLabelFromCard(a.conn, req.CardID, req.LabelID); err != nil {
		utils.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": "failed"})
		return
	}
	actor := middleware.UserID(r)
	_ = db.InsertCardActivity(a.conn, req.CardID, actor, "label_removed", "label_id="+strconv.FormatInt(req.LabelID,10))
	utils.WriteJSON(w, http.StatusOK, map[string]any{"ok": true})
}
type addCommentReq struct {
	CardID int64  `json:"card_id"`
	Body   string `json:"body"`
}

func (a *API) AdminAddComment(w http.ResponseWriter, r *http.Request) {
	var req addCommentReq
	if err := utils.ReadJSON(r, &req); err != nil {
		utils.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "bad json"})
		return
	}
	req.Body = strings.TrimSpace(req.Body)
	if req.CardID == 0 || req.Body == "" {
		utils.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "card_id and body required"})
		return
	}

	actor := middleware.UserID(r)
	id, err := db.CreateCardComment(a.conn, req.CardID, actor, req.Body)
	if err != nil {
		utils.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": "failed"})
		return
	}

	_ = db.InsertCardActivity(a.conn, req.CardID, actor, "comment_added", "comment_id="+strconv.FormatInt(id,10))
	utils.WriteJSON(w, http.StatusCreated, map[string]any{"id": id})
}

type updateCommentReq struct {
	CommentID int64  `json:"comment_id"`
	Body      string `json:"body"`
	CardID    int64  `json:"card_id"`
}

func (a *API) AdminUpdateComment(w http.ResponseWriter, r *http.Request) {
	var req updateCommentReq
	if err := utils.ReadJSON(r, &req); err != nil {
		utils.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "bad json"})
		return
	}
	req.Body = strings.TrimSpace(req.Body)
	if req.CommentID == 0 || req.Body == "" || req.CardID == 0 {
		utils.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "comment_id, card_id, body required"})
		return
	}
	if err := db.UpdateCardComment(a.conn, req.CommentID, req.Body); err != nil {
		utils.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": "failed"})
		return
	}
	actor := middleware.UserID(r)
	_ = db.InsertCardActivity(a.conn, req.CardID, actor, "comment_updated", "comment_id="+strconv.FormatInt(req.CommentID,10))
	utils.WriteJSON(w, http.StatusOK, map[string]any{"ok": true})
}

type deleteCommentReq struct {
	CommentID int64 `json:"comment_id"`
	CardID    int64 `json:"card_id"`
}

func (a *API) AdminDeleteComment(w http.ResponseWriter, r *http.Request) {
	var req deleteCommentReq
	if err := utils.ReadJSON(r, &req); err != nil {
		utils.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "bad json"})
		return
	}
	if req.CommentID == 0 || req.CardID == 0 {
		utils.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "comment_id and card_id required"})
		return
	}
	if err := db.DeleteCardComment(a.conn, req.CommentID); err != nil {
		utils.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": "failed"})
		return
	}
	actor := middleware.UserID(r)
	_ = db.InsertCardActivity(a.conn, req.CardID, actor, "comment_deleted", "comment_id="+strconv.FormatInt(req.CommentID,10))
	utils.WriteJSON(w, http.StatusOK, map[string]any{"ok": true})
}
func (a *API) AdminUploadAttachment(w http.ResponseWriter, r *http.Request) {
	// multipart/form-data: card_id, file
	if err := r.ParseMultipartForm(20 << 20); err != nil {
		utils.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "bad multipart form"})
		return
	}

	cardIDStr := r.FormValue("card_id")
	cardID, err := strconv.ParseInt(cardIDStr, 10, 64)
	if err != nil || cardID <= 0 {
		utils.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid card_id"})
		return
	}

	f, hdr, err := r.FormFile("file")
	if err != nil {
		utils.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "file required"})
		return
	}
	defer f.Close()

	_ = os.MkdirAll("./uploads", 0755)

	ext := filepath.Ext(hdr.Filename)
	stored := fmt.Sprintf("card_%d_%d%s", cardID, time.Now().UnixNano(), ext)
	dstPath := filepath.Join("./uploads", stored)

	dst, err := os.Create(dstPath)
	if err != nil {
		utils.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": "failed to save file"})
		return
	}
	defer dst.Close()

	n, err := io.Copy(dst, f)
	if err != nil {
		_ = os.Remove(dstPath)
		utils.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": "failed to write file"})
		return
	}

	mime := hdr.Header.Get("Content-Type")
	if strings.TrimSpace(mime) == "" {
		mime = "application/octet-stream"
	}

	actor := middleware.UserID(r)
	attID, err := db.InsertAttachment(a.conn, cardID, actor, hdr.Filename, stored, mime, n)
	if err != nil {
		_ = os.Remove(dstPath)
		utils.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": "db insert failed"})
		return
	}

	_ = db.InsertCardActivity(a.conn, cardID, actor, "attachment_added", "attachment_id="+strconv.FormatInt(attID,10))
	utils.WriteJSON(w, http.StatusCreated, map[string]any{"id": attID})
}

func (a *API) AdminDownloadAttachment(w http.ResponseWriter, r *http.Request) {
	idStr := r.URL.Query().Get("attachment_id")
	attID, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil || attID <= 0 {
		http.Error(w, "invalid attachment_id", http.StatusBadRequest)
		return
	}

	att, err := db.GetAttachment(a.conn, attID)
	if err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}

	p := filepath.Join("./uploads", att.StoredName)
	// security: ensure file is under uploads
	if !strings.HasPrefix(filepath.Clean(p), filepath.Clean("./uploads")) {
		http.Error(w, "bad path", http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", att.MimeType)
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, att.OriginalName))
	http.ServeFile(w, r, p)
}

type deleteAttachmentReq struct {
	AttachmentID int64 `json:"attachment_id"`
	CardID       int64 `json:"card_id"`
}

func (a *API) AdminDeleteAttachment(w http.ResponseWriter, r *http.Request) {
	var req deleteAttachmentReq
	if err := utils.ReadJSON(r, &req); err != nil {
		utils.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "bad json"})
		return
	}
	if req.AttachmentID == 0 || req.CardID == 0 {
		utils.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "attachment_id and card_id required"})
		return
	}

	att, err := db.GetAttachment(a.conn, req.AttachmentID)
	if err == nil {
		_ = os.Remove(filepath.Join("./uploads", att.StoredName))
	}

	if err := db.DeleteAttachment(a.conn, req.AttachmentID); err != nil {
		utils.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": "failed"})
		return
	}
	actor := middleware.UserID(r)
	_ = db.InsertCardActivity(a.conn, req.CardID, actor, "attachment_deleted", "attachment_id="+strconv.FormatInt(req.AttachmentID,10))
	utils.WriteJSON(w, http.StatusOK, map[string]any{"ok": true})
}
type createReminderReq struct {
	CardID   int64  `json:"card_id"`
	RemindAt string `json:"remind_at"` // ISO string (frontend sends)
}

func (a *API) AdminCreateReminder(w http.ResponseWriter, r *http.Request) {
	var req createReminderReq
	if err := utils.ReadJSON(r, &req); err != nil {
		utils.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "bad json"})
		return
	}
	req.RemindAt = strings.TrimSpace(req.RemindAt)
	if req.CardID == 0 || req.RemindAt == "" {
		utils.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "card_id and remind_at required"})
		return
	}
	userID := middleware.UserID(r)

	id, err := db.CreateReminder(a.conn, req.CardID, userID, req.RemindAt)
	if err != nil {
		utils.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "failed"})
		return
	}

	_ = db.InsertCardActivity(a.conn, req.CardID, userID, "reminder_added", "remind_at="+req.RemindAt)
	utils.WriteJSON(w, http.StatusCreated, map[string]any{"id": id})
}

type deleteReminderReq struct {
	ReminderID int64 `json:"reminder_id"`
	CardID     int64 `json:"card_id"`
}

func (a *API) AdminDeleteReminder(w http.ResponseWriter, r *http.Request) {
	var req deleteReminderReq
	if err := utils.ReadJSON(r, &req); err != nil {
		utils.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "bad json"})
		return
	}
	if req.ReminderID == 0 || req.CardID == 0 {
		utils.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "reminder_id and card_id required"})
		return
	}
	if err := db.DeleteReminder(a.conn, req.ReminderID); err != nil {
		utils.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": "failed"})
		return
	}
	actor := middleware.UserID(r)
	_ = db.InsertCardActivity(a.conn, req.CardID, actor, "reminder_deleted", "reminder_id="+strconv.FormatInt(req.ReminderID,10))
	utils.WriteJSON(w, http.StatusOK, map[string]any{"ok": true})
}