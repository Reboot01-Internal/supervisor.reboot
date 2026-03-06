package handlers

import (
	"database/sql"
	"net/http"
	"strings"

	"taskflow/internal/db"
	"taskflow/internal/utils"
)

type loginReq struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

func (a *API) Login(w http.ResponseWriter, r *http.Request) {
	var req loginReq
	if err := utils.ReadJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "bad json")
		return
	}

	email := strings.TrimSpace(strings.ToLower(req.Email))
	pass := req.Password

	// ✅ HARD CODED USERS (change however you want)
	// Admin
	if email == "admin@local.test" && pass == "Admin123!" {
		writeJSON(w, http.StatusOK, map[string]any{
			"role": "admin",
		})
		return
	}

	// Supervisor example
	if email == "supervisor@local.test" && pass == "Supervisor123!" {
		writeJSON(w, http.StatusOK, map[string]any{
			"role": "supervisor",
		})
		return
	}

	// Student example
	if email == "student@local.test" && pass == "Student123!" {
		writeJSON(w, http.StatusOK, map[string]any{
			"role": "student",
		})
		return
	}

	writeErr(w, http.StatusUnauthorized, "invalid credentials")
}

func (a *API) Me(w http.ResponseWriter, r *http.Request) {
	// No JWT anymore, so just return something simple
	writeJSON(w, http.StatusOK, map[string]any{
		"message": "no-auth mode",
	})
}

func (a *API) ResolveUserRole(w http.ResponseWriter, r *http.Request) {
	identifier := strings.TrimSpace(strings.ToLower(r.URL.Query().Get("identifier")))
	if identifier == "" {
		writeErr(w, http.StatusBadRequest, "identifier required")
		return
	}

	// Try email first.
	id, fullName, _, role, active, err := db.GetUserByEmail(a.conn, identifier)
	if err == nil && id > 0 {
		if !active {
			writeErr(w, http.StatusForbidden, "user is inactive")
			return
		}
		var nickname string
		_ = a.conn.QueryRow(`SELECT IFNULL(nickname,'') FROM users WHERE id = ?`, id).Scan(&nickname)
		writeJSON(w, http.StatusOK, map[string]any{
			"id":        id,
			"full_name": fullName,
			"email":     identifier,
			"nickname":  nickname,
			"role":      strings.ToLower(strings.TrimSpace(role)),
		})
		return
	}

	// Fallback: nickname lookup.
	var row struct {
		ID       int64
		FullName string
		Email    string
		Nickname string
		Role     string
		Active   int
	}
	err = a.conn.QueryRow(`
		SELECT id, full_name, email, IFNULL(nickname,''), role, is_active
		FROM users
		WHERE LOWER(IFNULL(nickname,'')) = LOWER(?)
		LIMIT 1
	`, identifier).Scan(&row.ID, &row.FullName, &row.Email, &row.Nickname, &row.Role, &row.Active)
	if err == sql.ErrNoRows {
		writeErr(w, http.StatusNotFound, "user not found")
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "db error")
		return
	}
	if row.Active != 1 {
		writeErr(w, http.StatusForbidden, "user is inactive")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"id":        row.ID,
		"full_name": row.FullName,
		"email":     strings.TrimSpace(strings.ToLower(row.Email)),
		"nickname":  strings.TrimSpace(row.Nickname),
		"role":      strings.ToLower(strings.TrimSpace(row.Role)),
	})
}
