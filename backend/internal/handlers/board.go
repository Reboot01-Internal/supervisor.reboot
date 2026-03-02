package handlers

import (
	"net/http"
	"strconv"
	"strings"

	"taskflow/internal/db"
	"taskflow/internal/middleware"
	"taskflow/internal/models"
	"taskflow/internal/utils"
)

//
// ============================================================
// BOARD
// ============================================================
//

func (a *API) AdminGetBoardFull(w http.ResponseWriter, r *http.Request) {
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

	b, err := db.GetBoardBasic(a.conn, boardID)
	if err != nil {
		utils.WriteJSON(w, http.StatusNotFound, map[string]any{"error": "board not found"})
		return
	}

	lists, err := db.ListLists(a.conn, boardID)
	if err != nil {
		utils.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": "db error"})
		return
	}
	labels, _ := db.ListLabelsByBoard(a.conn, boardID)

	cards, err := db.ListCardsByBoard(a.conn, boardID)
	if err != nil {
		utils.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": "db error"})
		return
	}

	out := models.BoardFull{
		BoardID: boardID,
		FileID:  b.SupervisorFileID,
		Name:    b.Name,
		Lists:   lists,
		Cards:   cards,
		Labels:  labels,
	}

	utils.WriteJSON(w, http.StatusOK, out)
}

//
// ============================================================
// LISTS
// ============================================================
//

type createListReq struct {
	BoardID int64  `json:"board_id"`
	Title   string `json:"title"`
}

func (a *API) AdminCreateList(w http.ResponseWriter, r *http.Request) {
	var req createListReq
	if err := utils.ReadJSON(r, &req); err != nil {
		utils.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "bad json"})
		return
	}

	req.Title = strings.TrimSpace(req.Title)
	if req.BoardID == 0 || req.Title == "" {
		utils.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "board_id and title required"})
		return
	}

	id, err := db.CreateList(a.conn, req.BoardID, req.Title)
	if err != nil {
		utils.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": "failed to create list"})
		return
	}

	utils.WriteJSON(w, http.StatusCreated, map[string]any{"id": id})
}

//
// ============================================================
// CARDS
// ============================================================
//

type createCardReq struct {
	ListID      int64  `json:"list_id"`
	Title       string `json:"title"`
	Description string `json:"description"`
}

func (a *API) AdminCreateCard(w http.ResponseWriter, r *http.Request) {
	var req createCardReq
	if err := utils.ReadJSON(r, &req); err != nil {
		utils.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "bad json"})
		return
	}

	req.Title = strings.TrimSpace(req.Title)
	req.Description = strings.TrimSpace(req.Description)

	if req.ListID == 0 || req.Title == "" {
		utils.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "list_id and title required"})
		return
	}

	id, err := db.CreateCard(a.conn, req.ListID, req.Title, req.Description)
	if err != nil {
		utils.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": "failed to create card"})
		return
	}
	  actor := middleware.UserID(r)
  _ = db.InsertCardActivity(a.conn, id, actor, "card_created", "Card created")

	utils.WriteJSON(w, http.StatusCreated, map[string]any{"id": id})
}

//
// ============================================================
// MOVE / REORDER
// ============================================================
//

type moveCardReq struct {
	CardID     int64 `json:"card_id"`
	ToListID   int64 `json:"to_list_id"`
	ToPosition int64 `json:"to_position"`
}

func (a *API) AdminMoveCard(w http.ResponseWriter, r *http.Request) {
	var req moveCardReq
	if err := utils.ReadJSON(r, &req); err != nil {
		utils.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "bad json"})
		return
	}

	if req.CardID == 0 || req.ToListID == 0 || req.ToPosition < 0 {
		utils.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid params"})
		return
	}

	if err := db.MoveCard(a.conn, req.CardID, req.ToListID, req.ToPosition); err != nil {
		utils.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": "failed to move card"})
		return
	}
	actor := middleware.UserID(r)
meta := "Moved to list_id=" + strconv.FormatInt(req.ToListID, 10)
_ = db.InsertCardActivity(a.conn, req.CardID, actor, "card_moved", meta)

	utils.WriteJSON(w, http.StatusOK, map[string]any{"ok": true})
}

type reorderReq struct {
	ListID int64   `json:"list_id"`
	IDs    []int64 `json:"ids"`
}

func (a *API) AdminReorderCards(w http.ResponseWriter, r *http.Request) {
	var req reorderReq
	if err := utils.ReadJSON(r, &req); err != nil {
		utils.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "bad json"})
		return
	}

	if req.ListID == 0 || len(req.IDs) == 0 {
		utils.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "list_id and ids required"})
		return
	}

	if err := db.ReorderCards(a.conn, req.ListID, req.IDs); err != nil {
		utils.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": "failed to reorder"})
		return
	}

	utils.WriteJSON(w, http.StatusOK, map[string]any{"ok": true})
}

//
// ============================================================
// CARD (WITH DUE DATE)
// ============================================================
//

type updateCardReq struct {
	CardID      int64  `json:"card_id"`
	Title       string `json:"title"`
	Description string `json:"description"`
	DueDate     string `json:"due_date"`
	Status      string `json:"status"`
	Priority    string `json:"priority"`
}

func (a *API) AdminGetCard(w http.ResponseWriter, r *http.Request) {
	cardIDStr := r.URL.Query().Get("card_id")
	if cardIDStr == "" {
		utils.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "card_id required"})
		return
	}

	cardID, err := strconv.ParseInt(cardIDStr, 10, 64)
	if err != nil || cardID <= 0 {
		utils.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid card_id"})
		return
	}

	c, err := db.GetCardWithDue(a.conn, cardID)
	if err != nil {
		utils.WriteJSON(w, http.StatusNotFound, map[string]any{"error": "card not found"})
		return
	}

	utils.WriteJSON(w, http.StatusOK, c)
}
func (a *API) AdminUpdateCard(w http.ResponseWriter, r *http.Request) {
	var req updateCardReq
	if err := utils.ReadJSON(r, &req); err != nil {
		utils.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "bad json"})
		return
	}

	req.Title = strings.TrimSpace(req.Title)
	req.Description = strings.TrimSpace(req.Description)
	req.DueDate = strings.TrimSpace(req.DueDate)
	req.Status = strings.TrimSpace(strings.ToLower(req.Status))
	req.Priority = strings.TrimSpace(strings.ToLower(req.Priority))

	if req.CardID == 0 || req.Title == "" {
		utils.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "card_id and title required"})
		return
	}

	// basic validation
	okStatus := map[string]bool{"todo": true, "doing": true, "blocked": true, "done": true}
	okPri := map[string]bool{"low": true, "medium": true, "high": true, "urgent": true}
	if req.Status != "" && !okStatus[req.Status] {
		utils.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid status"})
		return
	}
	if req.Priority != "" && !okPri[req.Priority] {
		utils.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid priority"})
		return
	}

	if err := db.UpdateCardAll(a.conn, req.CardID, req.Title, req.Description, req.DueDate, req.Status, req.Priority); err != nil {
		utils.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": "failed to update card"})
		return
	}

	actor := middleware.UserID(r)
	_ = db.InsertCardActivity(a.conn, req.CardID, actor, "card_updated", "Card updated")

	utils.WriteJSON(w, http.StatusOK, map[string]any{"ok": true})
}

//
// ============================================================
// CARD FULL (SUBTASKS + ASSIGNEES)
// ============================================================
//

func (a *API) AdminGetCardFull(w http.ResponseWriter, r *http.Request) {
  cardIDStr := r.URL.Query().Get("card_id")
  if cardIDStr == "" {
    utils.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "card_id required"})
    return
  }

  cardID, err := strconv.ParseInt(cardIDStr, 10, 64)
  if err != nil || cardID <= 0 {
    utils.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid card_id"})
    return
  }

	c, err := db.GetCardWithDue(a.conn, cardID)
	if err != nil {
		utils.WriteJSON(w, http.StatusNotFound, map[string]any{"error": "card not found"})
		return
	}

	boardID, err := db.GetBoardIDByCardID(a.conn, cardID)
	if err != nil {
		utils.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": "db error"})
		return
	}

	subtasks, err := db.ListSubtasks(a.conn, cardID)
	if err != nil {
		utils.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": "db error"})
		return
	}

	assignees, err := db.ListAssignees(a.conn, cardID)
	if err != nil {
		utils.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": "db error"})
		return
	}
	activities, err := db.ListCardActivity(a.conn, cardID, 40)
	if err != nil {
		utils.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": "db error"})
		return
	}

	labels, _ := db.ListCardLabels(a.conn, cardID)
	comments, _ := db.ListCardComments(a.conn, cardID, 60)
	attachments, _ := db.ListAttachments(a.conn, cardID, 50)
	reminders, _ := db.ListRemindersByCard(a.conn, cardID)

	utils.WriteJSON(w, http.StatusOK, models.CardFull{
		Card:        c,
		Subtasks:    subtasks,
		Assignees:   assignees,
		Activities:  activities,
		Labels:      labels,
		Comments:    comments,
		Attachments: attachments,
		Reminders:   reminders,
		BoardID:     boardID,
	})
}

//
// ============================================================
// SUBTASKS
// ============================================================
//

type createSubtaskReq struct {
	CardID int64  `json:"card_id"`
	Title  string `json:"title"`
	DueDate string `json:"due_date"`
}

func (a *API) AdminCreateSubtask(w http.ResponseWriter, r *http.Request) {
	var req createSubtaskReq
	if err := utils.ReadJSON(r, &req); err != nil {
		utils.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "bad json"})
		return
	}

	req.Title = strings.TrimSpace(req.Title)
	req.DueDate = strings.TrimSpace(req.DueDate)

	if req.CardID == 0 || req.Title == "" {
		utils.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "card_id and title required"})
		return
	}

	id, err := db.CreateSubtask(a.conn, req.CardID, req.Title, req.DueDate)
	if err != nil {
		utils.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": "failed"})
		return
	}
	actor := middleware.UserID(r)
_ = db.InsertCardActivity(a.conn, req.CardID, actor, "subtask_created", req.Title)

	utils.WriteJSON(w, http.StatusCreated, map[string]any{"id": id})
}
type toggleSubtaskReq struct {
	SubtaskID int64 `json:"subtask_id"`
	IsDone    bool  `json:"is_done"`
}

func (a *API) AdminToggleSubtask(w http.ResponseWriter, r *http.Request) {
	var req toggleSubtaskReq
	if err := utils.ReadJSON(r, &req); err != nil {
		utils.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "bad json"})
		return
	}

	if req.SubtaskID == 0 {
		utils.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "subtask_id required"})
		return
	}

	if err := db.ToggleSubtaskDone(a.conn, req.SubtaskID, req.IsDone); err != nil {
		utils.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": "failed"})
		return
	}
	cardID, err := db.GetCardIDBySubtaskID(a.conn, req.SubtaskID)
if err == nil {
  actor := middleware.UserID(r)
  _ = db.InsertCardActivity(a.conn, cardID, actor, "subtask_toggled", "subtask_id="+strconv.FormatInt(req.SubtaskID,10))
}

	utils.WriteJSON(w, http.StatusOK, map[string]any{"ok": true})
}

type deleteSubtaskReq struct {
	SubtaskID int64 `json:"subtask_id"`
}

func (a *API) AdminDeleteSubtask(w http.ResponseWriter, r *http.Request) {
	var req deleteSubtaskReq
	if err := utils.ReadJSON(r, &req); err != nil {
		utils.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "bad json"})
		return
	}

	if req.SubtaskID == 0 {
		utils.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "subtask_id required"})
		return
	}

	if err := db.DeleteSubtask(a.conn, req.SubtaskID); err != nil {
		utils.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": "failed"})
		return
	}
	cardID, err := db.GetCardIDBySubtaskID(a.conn, req.SubtaskID)
if err == nil {
  actor := middleware.UserID(r)
  _ = db.InsertCardActivity(a.conn, cardID, actor, "subtask_deleted", "subtask_id="+strconv.FormatInt(req.SubtaskID,10))
}

	utils.WriteJSON(w, http.StatusOK, map[string]any{"ok": true})
}
type updateSubtaskDueReq struct {
	SubtaskID int64  `json:"subtask_id"`
	DueDate   string `json:"due_date"`
}

func (a *API) AdminUpdateSubtaskDue(w http.ResponseWriter, r *http.Request) {
	var req updateSubtaskDueReq
	if err := utils.ReadJSON(r, &req); err != nil {
		utils.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "bad json"})
		return
	}

	if req.SubtaskID == 0 {
		utils.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "subtask_id required"})
		return
	}

	if err := db.UpdateSubtaskDueDate(a.conn, req.SubtaskID, req.DueDate); err != nil {
		utils.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": "failed"})
		return
	}
	cardID, err := db.GetCardIDBySubtaskID(a.conn, req.SubtaskID)
if err == nil {
  actor := middleware.UserID(r)
  _ = db.InsertCardActivity(a.conn, cardID, actor, "subtask_due_date_updated", "subtask_id="+strconv.FormatInt(req.SubtaskID,10))
}

	utils.WriteJSON(w, http.StatusOK, map[string]any{"ok": true})
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
	var req addAssigneeReq
	if err := utils.ReadJSON(r, &req); err != nil {
		utils.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "bad json"})
		return
	}

	if req.CardID == 0 || req.UserID == 0 {
		utils.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "card_id and user_id required"})
		return
	}

	if err := db.AddAssignee(a.conn, req.CardID, req.UserID); err != nil {
		utils.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": "failed"})
		return
	}
	actor := middleware.UserID(r)
_ = db.InsertCardActivity(a.conn, req.CardID, actor, "assignee_added", "user_id="+strconv.FormatInt(req.UserID,10))

	utils.WriteJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (a *API) AdminRemoveAssignee(w http.ResponseWriter, r *http.Request) {
	var req addAssigneeReq
	if err := utils.ReadJSON(r, &req); err != nil {
		utils.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "bad json"})
		return
	}

	if req.CardID == 0 || req.UserID == 0 {
		utils.WriteJSON(w, http.StatusBadRequest, map[string]any{"error": "card_id and user_id required"})
		return
	}

	if err := db.RemoveAssignee(a.conn, req.CardID, req.UserID); err != nil {
		utils.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": "failed"})
		return
	}
	actor := middleware.UserID(r)
_ = db.InsertCardActivity(a.conn, req.CardID, actor, "assignee_removed", "user_id="+strconv.FormatInt(req.UserID,10))

	utils.WriteJSON(w, http.StatusOK, map[string]any{"ok": true})
}