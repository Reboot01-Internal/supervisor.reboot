package handlers

import (
	"net/http"
	"strings"
	"taskflow/internal/db"
)

// Creation roles are snapshots: later edits and role changes do not transfer ownership.
// Adding a talent card to a staff list is allowed; changing that list is not.
func (a *API) allowBoardContentWrite(w http.ResponseWriter, r *http.Request, boardID int64, kind string, id int64) bool {
	role := strings.ToLower(strings.TrimSpace(r.Header.Get("X-User-Role")))
	if role == "" {
		role = "admin"
	}
	var creator string
	var err error
	switch kind {
	case "card", "card-completion":
		err = a.conn.QueryRow(`SELECT l.board_id,c.created_by_role FROM cards c JOIN lists l ON l.id=c.list_id WHERE c.id=?`, id).Scan(&boardID, &creator)
	case "list", "list-create-card":
		err = a.conn.QueryRow(`SELECT board_id,created_by_role FROM lists WHERE id=?`, id).Scan(&boardID, &creator)
	}
	if err != nil {
		writeErr(w, 404, "board content not found")
		return false
	}
	if role == "admin" {
		return true
	}
	actor := actorID(r, a.conn)
	if role == "supervisor" {
		allowed, err := db.CanViewBoard(a.conn, boardID, actor)
		if err != nil {
			writeErr(w, 500, "could not check board access")
			return false
		}
		if allowed {
			return true
		}
	} else if role == "student" {
		allowed, err := db.IsBoardMember(a.conn, boardID, actor)
		if err != nil {
			writeErr(w, 500, "could not check board membership")
			return false
		}
		if allowed && (kind == "" || kind == "list-create-card" || kind == "card-completion" || creator == "student") {
			return true
		}
	}
	writeErr(w, 403, "board membership and permission to edit this content are required")
	return false
}

// A full permutation is required; staff cards retain their slots.
func (a *API) allowTalentReorder(w http.ResponseWriter, listID int64, ids []int64) bool {
	rows, err := a.conn.Query(`SELECT id,created_by_role FROM cards WHERE list_id=? ORDER BY position,id`, listID)
	if err != nil {
		writeErr(w, 500, "could not check cards")
		return false
	}
	defer rows.Close()
	existing := map[int64]bool{}
	index := 0
	valid := true
	for rows.Next() {
		var id int64
		var role string
		if rows.Scan(&id, &role) != nil {
			valid = false
			break
		}
		existing[id] = true
		if index >= len(ids) || (role != "student" && ids[index] != id) {
			valid = false
		}
		index++
	}
	if rows.Err() != nil || index != len(ids) {
		valid = false
	}
	for _, id := range ids {
		if !existing[id] {
			valid = false
		}
		delete(existing, id)
	}
	if !valid {
		writeErr(w, 403, "only talent cards can be reordered; staff cards must stay in place")
	}
	return valid
}
