package handlers

import (
	"net/http"
	"strings"
	"taskflow/internal/utils"
)

func (a *API) UpdateUserStatus(w http.ResponseWriter, r *http.Request) {
	actor := actorID(r, a.conn)
	var login, role string
	var active bool
	if a.conn.QueryRow("SELECT IFNULL(nickname,''), role, is_active FROM users WHERE id=?", actor).Scan(&login, &role, &active) != nil || !active {
		writeErr(w, 403, "active staff account required")
		return
	}
	role = resolvedRole(login, role)
	if role != "admin" {
		writeErr(w, 403, "only admins can change account status")
		return
	}
	var req struct {
		UserID int64 `json:"user_id"`
		Active *bool `json:"is_active"`
	}
	if utils.ReadJSON(r, &req) != nil || req.UserID <= 0 || req.Active == nil {
		writeErr(w, 400, "user_id and is_active required")
		return
	}
	var targetRole, targetLogin string
	if a.conn.QueryRow("SELECT role, IFNULL(nickname,'') FROM users WHERE id=?", req.UserID).Scan(&targetRole, &targetLogin) != nil {
		writeErr(w, 404, "user not found")
		return
	}
	if req.UserID == actor || resolvedRole(targetLogin, targetRole) == "admin" {
		writeErr(w, 403, "this account is protected")
		return
	}
	if _, err := a.conn.Exec("UPDATE users SET is_active=? WHERE id=?", *req.Active, req.UserID); err != nil {
		writeErr(w, 500, "could not update account status")
		return
	}
	writeJSON(w, 200, map[string]any{"is_active": *req.Active})
}

// Reject deactivated identities before legacy actor resolution can fall back to an admin.
func (a *API) RequireActiveAccount(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		email := strings.TrimSpace(r.Header.Get("X-User-Email"))
		login := strings.TrimSpace(r.Header.Get("X-User-Login"))
		if email == "" {
			email = r.URL.Query().Get("email")
		}
		if login == "" {
			login = r.URL.Query().Get("login")
		}
		var inactive int
		err := a.conn.QueryRow("SELECT COUNT(*) FROM users WHERE is_active=0 AND ((?<>'' AND LOWER(email)=LOWER(?)) OR (?<>'' AND LOWER(nickname)=LOWER(?)))", email, email, login, login).Scan(&inactive)
		if err != nil {
			writeErr(w, 500, "could not check account status")
			return
		}
		if inactive > 0 {
			writeErr(w, 403, "account is inactive; contact your supervisor or admin")
			return
		}
		next.ServeHTTP(w, r)
	})
}
