package handlers

import (
	"net/http"

	"taskflow/internal/db"
	"taskflow/internal/utils"
)

type markNotificationReq struct {
	NotificationID int64 `json:"notification_id"`
}

func (a *API) ListNotifications(w http.ResponseWriter, r *http.Request) {
	actor := actorID(r, a.conn)
	items, err := db.ListNotificationsByUser(a.conn, actor)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "db error")
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (a *API) MarkNotificationRead(w http.ResponseWriter, r *http.Request) {
	var req markNotificationReq
	if err := utils.ReadJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "bad json")
		return
	}
	if req.NotificationID == 0 {
		writeErr(w, http.StatusBadRequest, "notification_id required")
		return
	}

	if err := db.MarkNotificationRead(a.conn, actorID(r, a.conn), req.NotificationID); err != nil {
		writeErr(w, http.StatusInternalServerError, "failed to mark notification")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (a *API) MarkAllNotificationsRead(w http.ResponseWriter, r *http.Request) {
	if err := db.MarkAllNotificationsRead(a.conn, actorID(r, a.conn)); err != nil {
		writeErr(w, http.StatusInternalServerError, "failed to mark notifications")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}
