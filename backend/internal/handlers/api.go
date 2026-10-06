package handlers

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"os"
	"strings"
	"sync"

	"taskflow/internal/discord"
)

type API struct {
	whiteboardOnce         sync.Once
	whiteboard             *whiteboardHub
	conn                   *sql.DB
	discord                *discord.Service
	notifications          *notificationHub
	stop                   context.CancelFunc
	roomsBookingsChannelID string
	roomsBookingsRoleID    string
}

func NewAPI(conn *sql.DB, discordSvc *discord.Service) *API {
	channelID := strings.TrimSpace(os.Getenv("DISCORD_ROOMS_BOOKINGS_CHANNEL_ID"))
	roleID := strings.TrimSpace(os.Getenv("DISCORD_TALENT_ROLE_ID"))

	return &API{
		conn:                   conn,
		discord:                discordSvc,
		notifications:          newNotificationHub(),
		roomsBookingsChannelID: channelID,
		roomsBookingsRoleID:    roleID,
	}
}

func (a *API) Shutdown() {
	if a.stop != nil {
		a.stop()
	}
}

// Shared JSON helpers (use everywhere)
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]any{
		"ok":    false,
		"error": msg,
	})
}
