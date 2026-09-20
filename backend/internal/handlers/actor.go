package handlers

import (
	"database/sql"
	"net/http"
	"strings"

	"taskflow/internal/db"
)

// fallback to seeded admin if no identity is provided
const DevActorID int64 = 1 // seeded admin user id

// actorID returns the local TaskFlow user id that should be used as "created_by".
// Since backend auth is disabled, we rely on the frontend sending identity headers.
func actorID(r *http.Request, conn *sql.DB) int64 {
	email := strings.TrimSpace(strings.ToLower(r.Header.Get("X-User-Email")))
	role := strings.TrimSpace(strings.ToLower(r.Header.Get("X-User-Role")))
	login := strings.TrimSpace(strings.ToLower(r.Header.Get("X-User-Login")))

	if email == "" {
		email = strings.TrimSpace(strings.ToLower(r.URL.Query().Get("email")))
	}
	if role == "" {
		role = strings.TrimSpace(strings.ToLower(r.URL.Query().Get("role")))
	}
	if login == "" {
		login = strings.TrimSpace(strings.ToLower(r.URL.Query().Get("login")))
	}

	// no identity → fallback
	if email == "" && login == "" {
		return DevActorID
	}

	// 1) try find user by email
	if email != "" {
		id, _, _, _, active, err := db.GetUserByEmail(conn, email)
		if err == nil && id > 0 {
			if active {
				if login != "" {
					_ = db.UpdateUserNickname(conn, id, login)
				}
				return id
			}
			return 0
		}
	}

	// 2) try find user by nickname/login
	if login != "" {
		id, _, _, _, active, err := db.GetUserByNickname(conn, login)
		if err == nil && id > 0 {
			if active {
				return id
			}
			return 0
		}
	}

	// 3) auto-create local user (dev mode)
	if role == "" {
		role = "student"
	}
	if role != "admin" && role != "supervisor" && role != "student" {
		role = "student"
	}

	identifier := email
	if identifier == "" {
		identifier = login
	}

	// full_name default = identifier if we don't have a name
	newID, err := db.CreateUserMinimal(conn, identifier, identifier, "", role)
	if err == nil && newID > 0 {
		if login != "" {
			_ = db.UpdateUserNickname(conn, newID, login)
		}
		// if created supervisor, ensure supervisor file exists
		if role == "supervisor" {
			_ = db.EnsureSupervisorFile(conn, newID)
		}
		return newID
	}

	return DevActorID
}
