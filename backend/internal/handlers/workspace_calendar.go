package handlers

import (
	"encoding/json"
	"net/http"
	"strings"
)

// WorkspaceCalendar returns cards only from boards visible to the current actor.
func (a *API) WorkspaceCalendar(w http.ResponseWriter, r *http.Request) {
	role := strings.ToLower(strings.TrimSpace(r.Header.Get("X-User-Role")))
	actor := actorID(r, a.conn)
	if role != "admin" && role != "supervisor" && role != "student" {
		writeErr(w, 403, "forbidden")
		return
	}
	rows, err := a.conn.Query(`
 SELECT c.id, c.list_id, c.title, IFNULL(c.due_date,''), IFNULL(c.status,'todo'), IFNULL(c.priority,'medium'),
 b.id, b.name, l.title, u.full_name, IFNULL(u.nickname,''), IFNULL(u.email,''),
 (SELECT json_group_array(json_object('user_id',au.id,'full_name',au.full_name,'nickname',IFNULL(au.nickname,''),'email',au.email)) FROM card_assignments ca JOIN users au ON au.id=ca.user_id WHERE ca.card_id=c.id),
 (SELECT json_group_array(json_object('label_id',lb.id,'name',lb.name,'color',lb.color)) FROM card_labels cl JOIN labels lb ON lb.id=cl.label_id WHERE cl.card_id=c.id)
 FROM cards c JOIN lists l ON l.id=c.list_id JOIN boards b ON b.id=l.board_id
 JOIN supervisor_files sf ON sf.id=b.supervisor_file_id JOIN users u ON u.id=sf.supervisor_user_id
 WHERE ?='admin' OR (?='supervisor' AND sf.supervisor_user_id=?) OR EXISTS (SELECT 1 FROM board_members bm WHERE bm.board_id=b.id AND bm.user_id=?)
 ORDER BY c.due_date, b.name, c.position, c.id`, role, role, actor, actor)
	if err != nil {
		writeErr(w, 500, "failed to load calendar")
		return
	}
	defer rows.Close()
	type entry struct {
		ID                 int64           `json:"id"`
		ListID             int64           `json:"list_id"`
		Title              string          `json:"title"`
		Due                string          `json:"due_date"`
		Status             string          `json:"status"`
		Priority           string          `json:"priority"`
		BoardID            int64           `json:"board_id"`
		BoardName          string          `json:"board_name"`
		ListName           string          `json:"list_name"`
		Owner              string          `json:"owner"`
		SupervisorUsername string          `json:"supervisor_username"`
		SupervisorEmail    string          `json:"supervisor_email"`
		Assignees          json.RawMessage `json:"assignees"`
		Labels             json.RawMessage `json:"labels"`
	}
	out := []entry{}
	for rows.Next() {
		var e entry
		var people, labels string
		if err := rows.Scan(&e.ID, &e.ListID, &e.Title, &e.Due, &e.Status, &e.Priority, &e.BoardID, &e.BoardName, &e.ListName, &e.Owner, &e.SupervisorUsername, &e.SupervisorEmail, &people, &labels); err != nil {
			writeErr(w, 500, "failed to read calendar")
			return
		}
		e.Assignees = json.RawMessage(people)
		e.Labels = json.RawMessage(labels)
		out = append(out, e)
	}
	if rows.Err() != nil {
		writeErr(w, 500, "failed to read calendar")
		return
	}
	writeJSON(w, 200, out)
}
