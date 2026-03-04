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

func (a *API) AdminGetBoardFull(w http.ResponseWriter, r *http.Request) {
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

	b, err := db.GetBoardBasic(a.conn, boardID)
	if err != nil {
		writeErr(w, http.StatusNotFound, "board not found")
		return
	}

	lists, err := db.ListLists(a.conn, boardID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "db error")
		return
	}
	labels, _ := db.ListLabelsByBoard(a.conn, boardID)

	cards, err := db.ListCardsByBoard(a.conn, boardID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "db error")
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

	writeJSON(w, http.StatusOK, out)
}

type createListReq struct {
	BoardID int64  `json:"board_id"`
	Title   string `json:"title"`
}

func (a *API) AdminCreateList(w http.ResponseWriter, r *http.Request) {
	var req createListReq
	if err := utils.ReadJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "bad json")
		return
	}

	req.Title = strings.TrimSpace(req.Title)
	if req.BoardID == 0 || req.Title == "" {
		writeErr(w, http.StatusBadRequest, "board_id and title required")
		return
	}

	id, err := db.CreateList(a.conn, req.BoardID, req.Title)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "failed to create list")
		return
	}

	writeJSON(w, http.StatusCreated, map[string]any{"id": id})
}

type createCardReq struct {
	ListID      int64  `json:"list_id"`
	Title       string `json:"title"`
	Description string `json:"description"`
}

func (a *API) AdminCreateCard(w http.ResponseWriter, r *http.Request) {
	var req createCardReq
	if err := utils.ReadJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "bad json")
		return
	}

	req.Title = strings.TrimSpace(req.Title)
	req.Description = strings.TrimSpace(req.Description)

	if req.ListID == 0 || req.Title == "" {
		writeErr(w, http.StatusBadRequest, "list_id and title required")
		return
	}

	id, err := db.CreateCard(a.conn, req.ListID, req.Title, req.Description)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "failed to create card")
		return
	}

	actor := middleware.UserID(r)
	_ = db.InsertCardActivity(a.conn, id, actor, "card_created", "Card created")

	writeJSON(w, http.StatusCreated, map[string]any{"id": id})
}

type moveCardReq struct {
	CardID     int64 `json:"card_id"`
	ToListID   int64 `json:"to_list_id"`
	ToPosition int64 `json:"to_position"`
}

func (a *API) AdminMoveCard(w http.ResponseWriter, r *http.Request) {
	var req moveCardReq
	if err := utils.ReadJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "bad json")
		return
	}

	if req.CardID == 0 || req.ToListID == 0 || req.ToPosition < 0 {
		writeErr(w, http.StatusBadRequest, "invalid params")
		return
	}

	if err := db.MoveCard(a.conn, req.CardID, req.ToListID, req.ToPosition); err != nil {
		writeErr(w, http.StatusInternalServerError, "failed to move card")
		return
	}

	actor := middleware.UserID(r)
	meta := "Moved to list_id=" + strconv.FormatInt(req.ToListID, 10)
	_ = db.InsertCardActivity(a.conn, req.CardID, actor, "card_moved", meta)

	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

type reorderReq struct {
	ListID int64   `json:"list_id"`
	IDs    []int64 `json:"ids"`
}

func (a *API) AdminReorderCards(w http.ResponseWriter, r *http.Request) {
	var req reorderReq
	if err := utils.ReadJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "bad json")
		return
	}

	if req.ListID == 0 || len(req.IDs) == 0 {
		writeErr(w, http.StatusBadRequest, "list_id and ids required")
		return
	}

	if err := db.ReorderCards(a.conn, req.ListID, req.IDs); err != nil {
		writeErr(w, http.StatusInternalServerError, "failed to reorder")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}


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
		writeErr(w, http.StatusBadRequest, "card_id required")
		return
	}

	cardID, err := strconv.ParseInt(cardIDStr, 10, 64)
	if err != nil || cardID <= 0 {
		writeErr(w, http.StatusBadRequest, "invalid card_id")
		return
	}

	c, err := db.GetCardWithDue(a.conn, cardID)
	if err != nil {
		writeErr(w, http.StatusNotFound, "card not found")
		return
	}

	writeJSON(w, http.StatusOK, c)
}

func (a *API) AdminUpdateCard(w http.ResponseWriter, r *http.Request) {
	var req updateCardReq
	if err := utils.ReadJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "bad json")
		return
	}

	req.Title = strings.TrimSpace(req.Title)
	req.Description = strings.TrimSpace(req.Description)
	req.DueDate = strings.TrimSpace(req.DueDate)
	req.Status = strings.TrimSpace(strings.ToLower(req.Status))
	req.Priority = strings.TrimSpace(strings.ToLower(req.Priority))

	if req.CardID == 0 || req.Title == "" {
		writeErr(w, http.StatusBadRequest, "card_id and title required")
		return
	}

	okStatus := map[string]bool{"todo": true, "doing": true, "blocked": true, "done": true}
	okPri := map[string]bool{"low": true, "medium": true, "high": true, "urgent": true}
	if req.Status != "" && !okStatus[req.Status] {
		writeErr(w, http.StatusBadRequest, "invalid status")
		return
	}
	if req.Priority != "" && !okPri[req.Priority] {
		writeErr(w, http.StatusBadRequest, "invalid priority")
		return
	}

	if err := db.UpdateCardAll(a.conn, req.CardID, req.Title, req.Description, req.DueDate, req.Status, req.Priority); err != nil {
		writeErr(w, http.StatusInternalServerError, "failed to update card")
		return
	}

	actor := middleware.UserID(r)
	_ = db.InsertCardActivity(a.conn, req.CardID, actor, "card_updated", "Card updated")

	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (a *API) AdminGetCardFull(w http.ResponseWriter, r *http.Request) {
	cardIDStr := r.URL.Query().Get("card_id")
	if cardIDStr == "" {
		writeErr(w, http.StatusBadRequest, "card_id required")
		return
	}

	cardID, err := strconv.ParseInt(cardIDStr, 10, 64)
	if err != nil || cardID <= 0 {
		writeErr(w, http.StatusBadRequest, "invalid card_id")
		return
	}

	c, err := db.GetCardWithDue(a.conn, cardID)
	if err != nil {
		writeErr(w, http.StatusNotFound, "card not found")
		return
	}

	boardID, err := db.GetBoardIDByCardID(a.conn, cardID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "db error")
		return
	}

	subtasks, err := db.ListSubtasks(a.conn, cardID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "db error")
		return
	}

	assignees, err := db.ListAssignees(a.conn, cardID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "db error")
		return
	}

	activities, err := db.ListCardActivity(a.conn, cardID, 40)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "db error")
		return
	}

	labels, _ := db.ListCardLabels(a.conn, cardID)
	comments, _ := db.ListCardComments(a.conn, cardID, 60)
	attachments, _ := db.ListAttachments(a.conn, cardID, 50)
	reminders, _ := db.ListRemindersByCard(a.conn, cardID)

	writeJSON(w, http.StatusOK, models.CardFull{
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
