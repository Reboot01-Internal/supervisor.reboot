package handlers

import (
	"net/http"
	"os"
	"strings"

	"taskflow/internal/auth"
	"taskflow/internal/db"
	"taskflow/internal/middleware"
	"taskflow/internal/utils"
)

func (a *API) JWTSecret() string {
	return os.Getenv("JWT_SECRET")
}

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

	req.Email = strings.TrimSpace(strings.ToLower(req.Email))
	if req.Email == "" || req.Password == "" {
		writeErr(w, http.StatusBadRequest, "email and password required")
		return
	}

	id, _, passHash, role, active, err := db.GetUserByEmail(a.conn, req.Email)
	if err != nil || !active || !auth.CheckPassword(passHash, req.Password) {
		writeErr(w, http.StatusUnauthorized, "invalid credentials")
		return
	}

	token, err := auth.SignToken(a.JWTSecret(), id, role)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "token error")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"token": token,
		"role":  role,
	})
}

func (a *API) Me(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserID(r)

	fullName, email, role, active, err := db.GetUserBasic(a.conn, userID)
	if err != nil || !active {
		writeErr(w, http.StatusUnauthorized, "user not found")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"id":        userID,
		"full_name": fullName,
		"email":     email,
		"role":      role,
	})
}