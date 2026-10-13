package handlers

import (
	"net/http"
	"strconv"
	"strings"
	"taskflow/internal/db"
	"taskflow/internal/utils"
)

func (a *API) AdminDuplicateBoard(w http.ResponseWriter, r *http.Request) {
	var req struct {
		BoardID   int64   `json:"board_id"`
		Name      string  `json:"name"`
		MemberIDs []int64 `json:"member_ids"`
	}
	if err := utils.ReadJSON(r, &req); err != nil {
		writeErr(w, 400, "bad json")
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.BoardID <= 0 || req.Name == "" {
		writeErr(w, 400, "board_id and name required")
		return
	}
	role := strings.ToLower(strings.TrimSpace(r.Header.Get("X-User-Role")))
	if role != "admin" && role != "supervisor" {
		writeErr(w, 403, "only admin or supervisor can duplicate boards")
		return
	}
	actor := actorID(r, a.conn)
	owner, err := db.GetBoardSupervisorUserID(a.conn, req.BoardID)
	if err != nil {
		writeErr(w, 404, "board not found")
		return
	}
	if role == "supervisor" && owner != actor {
		writeErr(w, 403, "cannot duplicate another supervisor's board")
		return
	}
	for _, id := range req.MemberIDs {
		targetRole, e := db.GetUserRole(a.conn, id)
		if e != nil || (targetRole != "student" && targetRole != "supervisor") {
			writeErr(w, 400, "invalid board member")
			return
		}
		if targetRole == "student" {
			ok, e := db.IsStudentAssignedToSupervisor(a.conn, owner, id)
			if e != nil {
				writeErr(w, 500, "could not validate members")
				return
			}
			if !ok {
				writeErr(w, 403, "student not assigned to this supervisor")
				return
			}
		}
	}
	id, err := db.DuplicateBoard(a.conn, req.BoardID, actor, req.Name, req.MemberIDs)
	if err != nil {
		writeErr(w, 500, "failed to duplicate board")
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"id": id, "discord_synced": a.syncBoardDiscordChannel(id)})
}

func (a *API) AdminDuplicateBoardName(w http.ResponseWriter, r *http.Request) {
	role := strings.ToLower(strings.TrimSpace(r.Header.Get("X-User-Role")))
	if role != "admin" && role != "supervisor" {
		writeErr(w, 403, "only admin or supervisor can duplicate boards")
		return
	}
	id, err := strconv.ParseInt(r.URL.Query().Get("board_id"), 10, 64)
	if err != nil || id <= 0 {
		writeErr(w, 400, "invalid board_id")
		return
	}
	owner, err := db.GetBoardSupervisorUserID(a.conn, id)
	if err != nil {
		writeErr(w, 404, "board not found")
		return
	}
	if role == "supervisor" && owner != actorID(r, a.conn) {
		writeErr(w, 403, "cannot duplicate another supervisor's board")
		return
	}
	name, err := db.NextDuplicateBoardName(a.conn, id)
	if err != nil {
		writeErr(w, 500, "failed to generate board name")
		return
	}
	writeJSON(w, 200, map[string]string{"name": name})
}
