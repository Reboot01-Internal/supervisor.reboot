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

	"taskflow/internal/db"
	"taskflow/internal/utils"
)

func (a *API) AdminEligibleStudents(w http.ResponseWriter, r *http.Request) {
	boardIDStr := r.URL.Query().Get("board_id")
	q := strings.TrimSpace(r.URL.Query().Get("q"))

	boardID, err := strconv.ParseInt(boardIDStr, 10, 64)
	if err != nil || boardID <= 0 {
		writeErr(w, http.StatusBadRequest, "invalid board_id")
		return
	}

	supID, err := db.GetBoardSupervisorUserID(a.conn, boardID)
	if err != nil || supID == 0 {
		writeErr(w, http.StatusBadRequest, "board has no supervisor")
		return
	}

	users, err := db.ListEligibleStudentsForSupervisor(a.conn, supID, q)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "db error")
		return
	}

	writeJSON(w, http.StatusOK, users)
}

func (a *API) SupervisorEligibleStudents(w http.ResponseWriter, r *http.Request) {
	boardIDStr := r.URL.Query().Get("board_id")
	q := strings.TrimSpace(r.URL.Query().Get("q"))

	boardID, err := strconv.ParseInt(boardIDStr, 10, 64)
	if err != nil || boardID <= 0 {
		writeErr(w, http.StatusBadRequest, "invalid board_id")
		return
	}

	supID, err := db.GetBoardSupervisorUserID(a.conn, boardID)
	if err != nil || supID == 0 {
		writeErr(w, http.StatusBadRequest, "board has no supervisor")
		return
	}

	actor := actorID(r, a.conn)
	if actor != supID {
		writeErr(w, http.StatusForbidden, "not your board")
		return
	}

	users, err := db.ListEligibleStudentsForSupervisor(a.conn, supID, q)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "db error")
		return
	}

	writeJSON(w, http.StatusOK, users)
}

// SUPERVISOR: add member (only assigned students + only their boards)
// POST /supervisor/board-members
func (a *API) SupervisorAddBoardMember(w http.ResponseWriter, r *http.Request) {
	var req addMemberReq
	if err := utils.ReadJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "bad json")
		return
	}

	if req.BoardID == 0 || req.UserID == 0 {
		writeErr(w, http.StatusBadRequest, "board_id and user_id required")
		return
	}

	boardSupID, err := db.GetBoardSupervisorUserID(a.conn, req.BoardID)
	if err != nil || boardSupID == 0 {
		writeErr(w, http.StatusBadRequest, "board has no supervisor")
		return
	}

	actor := actorID(r, a.conn)
	if actor != boardSupID {
		writeErr(w, http.StatusForbidden, "not your board")
		return
	}

	targetRole, err := db.GetUserRole(a.conn, req.UserID)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid user")
		return
	}
	if strings.ToLower(strings.TrimSpace(targetRole)) != "student" {
		writeErr(w, http.StatusForbidden, "only students can be added")
		return
	}

	ok, err := db.IsStudentAssignedToSupervisor(a.conn, boardSupID, req.UserID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "db error")
		return
	}
	if !ok {
		writeErr(w, http.StatusForbidden, "student not assigned to you")
		return
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

//
// ============================================================
// LABELS
// ============================================================
//

type createLabelReq struct {
	BoardID int64  `json:"board_id"`
	Name    string `json:"name"`
	Color   string `json:"color"`
}

func (a *API) AdminCreateLabel(w http.ResponseWriter, r *http.Request) {
	role := strings.TrimSpace(strings.ToLower(r.Header.Get("X-User-Role")))
	if role == "" {
		role = "admin"
	}
	if role != "admin" && role != "supervisor" {
		writeErr(w, http.StatusForbidden, "only admin or supervisor can create labels")
		return
	}
	var req createLabelReq
	if err := utils.ReadJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "bad json")
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	req.Color = strings.TrimSpace(strings.ToLower(req.Color))

	if req.BoardID == 0 || req.Name == "" {
		writeErr(w, http.StatusBadRequest, "board_id and name required")
		return
	}

	id, err := db.CreateLabel(a.conn, req.BoardID, req.Name, req.Color)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "failed to create label (maybe duplicate?)")
		return
	}

	writeJSON(w, http.StatusCreated, map[string]any{"id": id})
}

func (a *API) AdminListLabels(w http.ResponseWriter, r *http.Request) {
	boardIDStr := r.URL.Query().Get("board_id")
	if boardIDStr == "" {
		writeErr(w, http.StatusBadRequest, "board_id required")
		return
	}
	boardID, err := strconv.ParseInt(boardIDStr, 10, 64)
	if err != nil || boardID <= 0 {
		writeErr(w, http.StatusBadRequest, "invalid board_id")
		return
	}

	labels, err := db.ListLabelsByBoard(a.conn, boardID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "db error")
		return
	}
	writeJSON(w, http.StatusOK, labels)
}

type updateLabelReq struct {
	LabelID int64  `json:"label_id"`
	Name    string `json:"name"`
	Color   string `json:"color"`
}

func (a *API) AdminUpdateLabel(w http.ResponseWriter, r *http.Request) {
	role := strings.TrimSpace(strings.ToLower(r.Header.Get("X-User-Role")))
	if role == "" {
		role = "admin"
	}
	if role != "admin" && role != "supervisor" {
		writeErr(w, http.StatusForbidden, "only admin or supervisor can update labels")
		return
	}
	var req updateLabelReq
	if err := utils.ReadJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "bad json")
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	req.Color = strings.TrimSpace(strings.ToLower(req.Color))
	if req.LabelID == 0 || req.Name == "" {
		writeErr(w, http.StatusBadRequest, "label_id and name required")
		return
	}
	if err := db.UpdateLabel(a.conn, req.LabelID, req.Name, req.Color); err != nil {
		writeErr(w, http.StatusBadRequest, "failed to update label")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

type deleteLabelReq struct {
	LabelID int64 `json:"label_id"`
}

func (a *API) AdminDeleteLabel(w http.ResponseWriter, r *http.Request) {
	role := strings.TrimSpace(strings.ToLower(r.Header.Get("X-User-Role")))
	if role == "" {
		role = "admin"
	}
	if role != "admin" && role != "supervisor" {
		writeErr(w, http.StatusForbidden, "only admin or supervisor can delete labels")
		return
	}
	var req deleteLabelReq
	if err := utils.ReadJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "bad json")
		return
	}
	if req.LabelID == 0 {
		writeErr(w, http.StatusBadRequest, "label_id required")
		return
	}
	if err := db.DeleteLabel(a.conn, req.LabelID); err != nil {
		writeErr(w, http.StatusInternalServerError, "failed to delete label")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

type cardLabelReq struct {
	CardID  int64 `json:"card_id"`
	LabelID int64 `json:"label_id"`
}

func (a *API) AdminAddCardLabel(w http.ResponseWriter, r *http.Request) {
	role := strings.TrimSpace(strings.ToLower(r.Header.Get("X-User-Role")))
	if role == "" {
		role = "admin"
	}
	if role != "admin" && role != "supervisor" {
		writeErr(w, http.StatusForbidden, "only admin or supervisor can edit card labels")
		return
	}
	var req cardLabelReq
	if err := utils.ReadJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "bad json")
		return
	}
	if req.CardID == 0 || req.LabelID == 0 {
		writeErr(w, http.StatusBadRequest, "card_id and label_id required")
		return
	}
	if err := db.AddLabelToCard(a.conn, req.CardID, req.LabelID); err != nil {
		writeErr(w, http.StatusInternalServerError, "failed")
		return
	}
	actor := actorID(r, a.conn)
	_ = db.InsertCardActivity(a.conn, req.CardID, actor, "label_added", "label_id="+strconv.FormatInt(req.LabelID, 10))
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (a *API) AdminRemoveCardLabel(w http.ResponseWriter, r *http.Request) {
	role := strings.TrimSpace(strings.ToLower(r.Header.Get("X-User-Role")))
	if role == "" {
		role = "admin"
	}
	if role != "admin" && role != "supervisor" {
		writeErr(w, http.StatusForbidden, "only admin or supervisor can edit card labels")
		return
	}
	var req cardLabelReq
	if err := utils.ReadJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "bad json")
		return
	}
	if req.CardID == 0 || req.LabelID == 0 {
		writeErr(w, http.StatusBadRequest, "card_id and label_id required")
		return
	}
	if err := db.RemoveLabelFromCard(a.conn, req.CardID, req.LabelID); err != nil {
		writeErr(w, http.StatusInternalServerError, "failed")
		return
	}
	actor := actorID(r, a.conn)
	_ = db.InsertCardActivity(a.conn, req.CardID, actor, "label_removed", "label_id="+strconv.FormatInt(req.LabelID, 10))
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

//
// ============================================================
// COMMENTS
// ============================================================
//

type addCommentReq struct {
	CardID int64  `json:"card_id"`
	Body   string `json:"body"`
}

func (a *API) AdminAddComment(w http.ResponseWriter, r *http.Request) {
	role := strings.TrimSpace(strings.ToLower(r.Header.Get("X-User-Role")))
	if role == "" {
		role = "admin"
	}
	var req addCommentReq
	if err := utils.ReadJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "bad json")
		return
	}
	req.Body = strings.TrimSpace(req.Body)
	if req.CardID == 0 || req.Body == "" {
		writeErr(w, http.StatusBadRequest, "card_id and body required")
		return
	}
	actor := actorID(r, a.conn)
	if role == "student" {
		boardID, err := db.GetBoardIDByCardID(a.conn, req.CardID)
		if err != nil || boardID == 0 {
			writeErr(w, http.StatusBadRequest, "invalid card")
			return
		}
		ok, err := db.IsBoardMember(a.conn, boardID, actor)
		if err != nil {
			writeErr(w, http.StatusInternalServerError, "db error")
			return
		}
		if !ok {
			writeErr(w, http.StatusForbidden, "not a member of this board")
			return
		}
	}
	id, err := db.CreateCardComment(a.conn, req.CardID, actor, req.Body)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "failed")
		return
	}

	_ = db.InsertCardActivity(a.conn, req.CardID, actor, "comment_added", "comment_id="+strconv.FormatInt(id, 10))
	writeJSON(w, http.StatusCreated, map[string]any{"id": id})
}

type updateCommentReq struct {
	CommentID int64  `json:"comment_id"`
	Body      string `json:"body"`
	CardID    int64  `json:"card_id"`
}

func (a *API) AdminUpdateComment(w http.ResponseWriter, r *http.Request) {
	role := strings.TrimSpace(strings.ToLower(r.Header.Get("X-User-Role")))
	if role == "" {
		role = "admin"
	}
	if role != "admin" && role != "supervisor" {
		writeErr(w, http.StatusForbidden, "only admin or supervisor can edit comments")
		return
	}
	var req updateCommentReq
	if err := utils.ReadJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "bad json")
		return
	}
	req.Body = strings.TrimSpace(req.Body)
	if req.CommentID == 0 || req.Body == "" || req.CardID == 0 {
		writeErr(w, http.StatusBadRequest, "comment_id, card_id, body required")
		return
	}
	if err := db.UpdateCardComment(a.conn, req.CommentID, req.Body); err != nil {
		writeErr(w, http.StatusInternalServerError, "failed")
		return
	}
	actor := actorID(r, a.conn)
	_ = db.InsertCardActivity(a.conn, req.CardID, actor, "comment_updated", "comment_id="+strconv.FormatInt(req.CommentID, 10))
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

type deleteCommentReq struct {
	CommentID int64 `json:"comment_id"`
	CardID    int64 `json:"card_id"`
}

func (a *API) AdminDeleteComment(w http.ResponseWriter, r *http.Request) {
	role := strings.TrimSpace(strings.ToLower(r.Header.Get("X-User-Role")))
	if role == "" {
		role = "admin"
	}
	if role != "admin" && role != "supervisor" {
		writeErr(w, http.StatusForbidden, "only admin or supervisor can delete comments")
		return
	}
	var req deleteCommentReq
	if err := utils.ReadJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "bad json")
		return
	}
	if req.CommentID == 0 || req.CardID == 0 {
		writeErr(w, http.StatusBadRequest, "comment_id and card_id required")
		return
	}
	if err := db.DeleteCardComment(a.conn, req.CommentID); err != nil {
		writeErr(w, http.StatusInternalServerError, "failed")
		return
	}
	actor := actorID(r, a.conn)
	_ = db.InsertCardActivity(a.conn, req.CardID, actor, "comment_deleted", "comment_id="+strconv.FormatInt(req.CommentID, 10))
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

//
// ============================================================
// ATTACHMENTS
// ============================================================
//

func (a *API) AdminUploadAttachment(w http.ResponseWriter, r *http.Request) {
	// multipart/form-data: card_id, file
	if err := r.ParseMultipartForm(20 << 20); err != nil {
		writeErr(w, http.StatusBadRequest, "bad multipart form")
		return
	}

	cardIDStr := r.FormValue("card_id")
	cardID, err := strconv.ParseInt(cardIDStr, 10, 64)
	if err != nil || cardID <= 0 {
		writeErr(w, http.StatusBadRequest, "invalid card_id")
		return
	}

	f, hdr, err := r.FormFile("file")
	if err != nil {
		writeErr(w, http.StatusBadRequest, "file required")
		return
	}
	defer f.Close()

	_ = os.MkdirAll("./uploads", 0755)

	ext := filepath.Ext(hdr.Filename)
	stored := fmt.Sprintf("card_%d_%d%s", cardID, time.Now().UnixNano(), ext)
	dstPath := filepath.Join("./uploads", stored)

	dst, err := os.Create(dstPath)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "failed to save file")
		return
	}
	defer dst.Close()

	n, err := io.Copy(dst, f)
	if err != nil {
		_ = os.Remove(dstPath)
		writeErr(w, http.StatusInternalServerError, "failed to write file")
		return
	}

	mime := hdr.Header.Get("Content-Type")
	if strings.TrimSpace(mime) == "" {
		mime = "application/octet-stream"
	}

	actor := actorID(r, a.conn)
	attID, err := db.InsertAttachment(a.conn, cardID, actor, hdr.Filename, stored, mime, n)
	if err != nil {
		_ = os.Remove(dstPath)
		writeErr(w, http.StatusInternalServerError, "db insert failed")
		return
	}

	_ = db.InsertCardActivity(a.conn, cardID, actor, "attachment_added", "attachment_id="+strconv.FormatInt(attID, 10))
	writeJSON(w, http.StatusCreated, map[string]any{"id": attID})
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
		writeErr(w, http.StatusBadRequest, "bad json")
		return
	}
	if req.AttachmentID == 0 || req.CardID == 0 {
		writeErr(w, http.StatusBadRequest, "attachment_id and card_id required")
		return
	}

	att, err := db.GetAttachment(a.conn, req.AttachmentID)
	if err == nil {
		_ = os.Remove(filepath.Join("./uploads", att.StoredName))
	}

	if err := db.DeleteAttachment(a.conn, req.AttachmentID); err != nil {
		writeErr(w, http.StatusInternalServerError, "failed")
		return
	}

	actor := actorID(r, a.conn)
	_ = db.InsertCardActivity(a.conn, req.CardID, actor, "attachment_deleted", "attachment_id="+strconv.FormatInt(req.AttachmentID, 10))
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

//
// ============================================================
// REMINDERS
// ============================================================
//

type createReminderReq struct {
	CardID   int64  `json:"card_id"`
	RemindAt string `json:"remind_at"`
}

func (a *API) AdminCreateReminder(w http.ResponseWriter, r *http.Request) {
	var req createReminderReq
	if err := utils.ReadJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "bad json")
		return
	}
	req.RemindAt = strings.TrimSpace(req.RemindAt)
	if req.CardID == 0 || req.RemindAt == "" {
		writeErr(w, http.StatusBadRequest, "card_id and remind_at required")
		return
	}
	userID := actorID(r, a.conn)

	id, err := db.CreateReminder(a.conn, req.CardID, userID, req.RemindAt)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "failed")
		return
	}

	_ = db.InsertCardActivity(a.conn, req.CardID, userID, "reminder_added", "remind_at="+req.RemindAt)
	writeJSON(w, http.StatusCreated, map[string]any{"id": id})
}

type deleteReminderReq struct {
	ReminderID int64 `json:"reminder_id"`
	CardID     int64 `json:"card_id"`
}

func (a *API) AdminDeleteReminder(w http.ResponseWriter, r *http.Request) {
	var req deleteReminderReq
	if err := utils.ReadJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "bad json")
		return
	}
	if req.ReminderID == 0 || req.CardID == 0 {
		writeErr(w, http.StatusBadRequest, "reminder_id and card_id required")
		return
	}
	if err := db.DeleteReminder(a.conn, req.ReminderID); err != nil {
		writeErr(w, http.StatusInternalServerError, "failed")
		return
	}
	actor := actorID(r, a.conn)
	_ = db.InsertCardActivity(a.conn, req.CardID, actor, "reminder_deleted", "reminder_id="+strconv.FormatInt(req.ReminderID, 10))
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

//
// ============================================================
// SUBTASKS
// ============================================================
//

type createSubtaskReq struct {
	CardID  int64  `json:"card_id"`
	Title   string `json:"title"`
	DueDate string `json:"due_date"`
}

func (a *API) AdminCreateSubtask(w http.ResponseWriter, r *http.Request) {
	role := strings.TrimSpace(strings.ToLower(r.Header.Get("X-User-Role")))
	if role == "" {
		role = "admin"
	}
	if role != "admin" && role != "supervisor" {
		writeErr(w, http.StatusForbidden, "only admin or supervisor can create checklist items")
		return
	}
	var req createSubtaskReq
	if err := utils.ReadJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "bad json")
		return
	}

	req.Title = strings.TrimSpace(req.Title)
	req.DueDate = strings.TrimSpace(req.DueDate)

	if req.CardID == 0 || req.Title == "" {
		writeErr(w, http.StatusBadRequest, "card_id and title required")
		return
	}

	id, err := db.CreateSubtask(a.conn, req.CardID, req.Title, req.DueDate)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "failed")
		return
	}

	actor := actorID(r, a.conn)
	_ = db.InsertCardActivity(a.conn, req.CardID, actor, "subtask_created", req.Title)
	writeJSON(w, http.StatusCreated, map[string]any{"id": id})
}

type toggleSubtaskReq struct {
	SubtaskID int64 `json:"subtask_id"`
	IsDone    bool  `json:"is_done"`
}

func (a *API) AdminToggleSubtask(w http.ResponseWriter, r *http.Request) {
	role := strings.TrimSpace(strings.ToLower(r.Header.Get("X-User-Role")))
	if role == "" {
		role = "admin"
	}
	var req toggleSubtaskReq
	if err := utils.ReadJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "bad json")
		return
	}

	if req.SubtaskID == 0 {
		writeErr(w, http.StatusBadRequest, "subtask_id required")
		return
	}
	if role == "student" {
		cardID, err := db.GetCardIDBySubtaskID(a.conn, req.SubtaskID)
		if err != nil || cardID == 0 {
			writeErr(w, http.StatusBadRequest, "invalid subtask")
			return
		}
		boardID, err := db.GetBoardIDByCardID(a.conn, cardID)
		if err != nil || boardID == 0 {
			writeErr(w, http.StatusBadRequest, "invalid card")
			return
		}
		ok, err := db.IsBoardMember(a.conn, boardID, actorID(r, a.conn))
		if err != nil {
			writeErr(w, http.StatusInternalServerError, "db error")
			return
		}
		if !ok {
			writeErr(w, http.StatusForbidden, "not a member of this board")
			return
		}
	}

	if err := db.ToggleSubtaskDone(a.conn, req.SubtaskID, req.IsDone); err != nil {
		writeErr(w, http.StatusInternalServerError, "failed")
		return
	}

	cardID, err := db.GetCardIDBySubtaskID(a.conn, req.SubtaskID)
	if err == nil {
		actor := actorID(r, a.conn)
		_ = db.InsertCardActivity(a.conn, cardID, actor, "subtask_toggled", "subtask_id="+strconv.FormatInt(req.SubtaskID, 10))
	}

	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

type deleteSubtaskReq struct {
	SubtaskID int64 `json:"subtask_id"`
}

func (a *API) AdminDeleteSubtask(w http.ResponseWriter, r *http.Request) {
	role := strings.TrimSpace(strings.ToLower(r.Header.Get("X-User-Role")))
	if role == "" {
		role = "admin"
	}
	if role != "admin" && role != "supervisor" {
		writeErr(w, http.StatusForbidden, "only admin or supervisor can delete checklist items")
		return
	}
	var req deleteSubtaskReq
	if err := utils.ReadJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "bad json")
		return
	}

	if req.SubtaskID == 0 {
		writeErr(w, http.StatusBadRequest, "subtask_id required")
		return
	}

	if err := db.DeleteSubtask(a.conn, req.SubtaskID); err != nil {
		writeErr(w, http.StatusInternalServerError, "failed")
		return
	}

	cardID, err := db.GetCardIDBySubtaskID(a.conn, req.SubtaskID)
	if err == nil {
		actor := actorID(r, a.conn)
		_ = db.InsertCardActivity(a.conn, cardID, actor, "subtask_deleted", "subtask_id="+strconv.FormatInt(req.SubtaskID, 10))
	}

	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

type updateSubtaskDueReq struct {
	SubtaskID int64  `json:"subtask_id"`
	DueDate   string `json:"due_date"`
}

func (a *API) AdminUpdateSubtaskDue(w http.ResponseWriter, r *http.Request) {
	role := strings.TrimSpace(strings.ToLower(r.Header.Get("X-User-Role")))
	if role == "" {
		role = "admin"
	}
	if role != "admin" && role != "supervisor" {
		writeErr(w, http.StatusForbidden, "only admin or supervisor can edit checklist items")
		return
	}
	var req updateSubtaskDueReq
	if err := utils.ReadJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "bad json")
		return
	}

	if req.SubtaskID == 0 {
		writeErr(w, http.StatusBadRequest, "subtask_id required")
		return
	}

	if err := db.UpdateSubtaskDueDate(a.conn, req.SubtaskID, req.DueDate); err != nil {
		writeErr(w, http.StatusInternalServerError, "failed")
		return
	}

	cardID, err := db.GetCardIDBySubtaskID(a.conn, req.SubtaskID)
	if err == nil {
		actor := actorID(r, a.conn)
		_ = db.InsertCardActivity(a.conn, cardID, actor, "subtask_due_date_updated", "subtask_id="+strconv.FormatInt(req.SubtaskID, 10))
	}

	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

type updateSubtaskReq struct {
	SubtaskID int64  `json:"subtask_id"`
	Title     string `json:"title"`
	DueDate   string `json:"due_date"`
}

func (a *API) AdminUpdateSubtask(w http.ResponseWriter, r *http.Request) {
	role := strings.TrimSpace(strings.ToLower(r.Header.Get("X-User-Role")))
	if role == "" {
		role = "admin"
	}
	if role != "admin" && role != "supervisor" {
		writeErr(w, http.StatusForbidden, "only admin or supervisor can edit checklist items")
		return
	}
	var req updateSubtaskReq
	if err := utils.ReadJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "bad json")
		return
	}

	req.Title = strings.TrimSpace(req.Title)
	req.DueDate = strings.TrimSpace(req.DueDate)

	if req.SubtaskID == 0 {
		writeErr(w, http.StatusBadRequest, "subtask_id required")
		return
	}
	if req.Title == "" {
		writeErr(w, http.StatusBadRequest, "title required")
		return
	}

	if err := db.UpdateSubtask(a.conn, req.SubtaskID, req.Title, req.DueDate); err != nil {
		writeErr(w, http.StatusInternalServerError, "failed")
		return
	}

	cardID, err := db.GetCardIDBySubtaskID(a.conn, req.SubtaskID)
	if err == nil {
		actor := actorID(r, a.conn)
		_ = db.InsertCardActivity(a.conn, cardID, actor, "subtask_updated", "subtask_id="+strconv.FormatInt(req.SubtaskID, 10))
	}

	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

//
// ============================================================
// ASSIGNEES
// ============================================================
//

type addAssigneeReq struct {
	CardID int64 `json:"card_id"`
	UserID int64 `json:"user_id"`
}

func (a *API) AdminAddAssignee(w http.ResponseWriter, r *http.Request) {
	role := strings.TrimSpace(strings.ToLower(r.Header.Get("X-User-Role")))
	if role == "" {
		role = "admin"
	}
	if role != "admin" && role != "supervisor" {
		writeErr(w, http.StatusForbidden, "only admin or supervisor can manage assignees")
		return
	}
	var req addAssigneeReq
	if err := utils.ReadJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "bad json")
		return
	}

	if req.CardID == 0 || req.UserID == 0 {
		writeErr(w, http.StatusBadRequest, "card_id and user_id required")
		return
	}

	if err := db.AddAssignee(a.conn, req.CardID, req.UserID); err != nil {
		writeErr(w, http.StatusInternalServerError, "failed")
		return
	}

	actor := actorID(r, a.conn)
	_ = db.InsertCardActivity(a.conn, req.CardID, actor, "assignee_added", "user_id="+strconv.FormatInt(req.UserID, 10))
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (a *API) AdminRemoveAssignee(w http.ResponseWriter, r *http.Request) {
	role := strings.TrimSpace(strings.ToLower(r.Header.Get("X-User-Role")))
	if role == "" {
		role = "admin"
	}
	if role != "admin" && role != "supervisor" {
		writeErr(w, http.StatusForbidden, "only admin or supervisor can manage assignees")
		return
	}
	var req addAssigneeReq
	if err := utils.ReadJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "bad json")
		return
	}

	if req.CardID == 0 || req.UserID == 0 {
		writeErr(w, http.StatusBadRequest, "card_id and user_id required")
		return
	}

	if err := db.RemoveAssignee(a.conn, req.CardID, req.UserID); err != nil {
		writeErr(w, http.StatusInternalServerError, "failed")
		return
	}

	actor := actorID(r, a.conn)
	_ = db.InsertCardActivity(a.conn, req.CardID, actor, "assignee_removed", "user_id="+strconv.FormatInt(req.UserID, 10))
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}
