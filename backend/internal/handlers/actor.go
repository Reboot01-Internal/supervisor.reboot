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

	// no identity → fallback
	if email == "" {
		return DevActorID
	}

	// 1) try find user
	id, _, _, _, active, err := db.GetUserByEmail(conn, email)
	if err == nil && id > 0 {
		if active {
			return id
		}
		// user exists but inactive → fallback
		return DevActorID
	}

	// 2) auto-create local user (dev mode)
	if role == "" {
		role = "student"
	}
	if role != "admin" && role != "supervisor" && role != "student" {
		role = "student"
	}

	// full_name default = email if we don't have a name
	newID, err := db.CreateUserMinimal(conn, email, email, "", role)
	if err == nil && newID > 0 {
		// if created supervisor, ensure supervisor file exists
		if role == "supervisor" {
			_ = db.EnsureSupervisorFile(conn, newID)
		}
		return newID
	}

	return DevActorID
}