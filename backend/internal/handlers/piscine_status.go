package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"
)

func (a *API) RustPiscineStatuses(w http.ResponseWriter, r *http.Request) {
	actor := actorID(r, a.conn)
	var login, role string
	if a.conn.QueryRow("SELECT IFNULL(nickname,''),role FROM users WHERE id=?", actor).Scan(&login, &role) != nil {
		writeErr(w, 401, "unknown user")
		return
	}
	role = resolvedRole(login, role)
	if role != "admin" && role != "supervisor" {
		writeErr(w, 403, "not allowed")
		return
	}
	query := `SELECT DISTINCT IFNULL(u.nickname,'') FROM users u WHERE u.role IN ('student','supervisor')`
	args := []any{}
	if role == "supervisor" {
		query += ` AND u.id IN (SELECT student_user_id FROM supervisor_students WHERE supervisor_user_id=?)`
		args = append(args, actor)
	}
	rows, err := a.conn.Query(query, args...)
	if err != nil {
		writeErr(w, 500, "could not load users")
		return
	}
	logins := []string{}
	for rows.Next() {
		var l string
		if rows.Scan(&l) != nil {
			rows.Close()
			writeErr(w, 500, "could not load users")
			return
		}
		if l != "" {
			logins = append(logins, l)
		}
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		writeErr(w, 500, "could not load users")
		return
	}
	out := map[string]string{}
	if len(logins) == 0 {
		writeJSON(w, 200, out)
		return
	}
	token, err := getRebootAdminToken()
	if err != nil {
		writeErr(w, 502, "Reboot status unavailable")
		return
	}
	payload, _ := json.Marshal(map[string]any{"query": `query RustStatuses($logins:[String!]!) { user(where:{login:{_in:$logins}}){login} progress(where:{userLogin:{_in:$logins},path:{_like:"%/piscine-rust"}},order_by:{updatedAt:desc}) { userLogin grade isDone } }`, "variables": map[string]any{"logins": logins}})
	ctx, cancel := context.WithTimeout(r.Context(), 12*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, "POST", rebootSchoolURL()+"/api/graphql-engine/v1/graphql", bytes.NewReader(payload))
	if err != nil {
		writeErr(w, 502, "Reboot status unavailable")
		return
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		writeErr(w, 502, "Reboot status unavailable")
		return
	}
	defer res.Body.Close()
	var data struct {
		Data struct {
			Users []struct {
				Login string `json:"login"`
			} `json:"user"`
			Progress []struct {
				Login string   `json:"userLogin"`
				Grade *float64 `json:"grade"`
				Done  bool     `json:"isDone"`
			} `json:"progress"`
		} `json:"data"`
		Errors []any `json:"errors"`
	}
	if res.StatusCode != 200 || json.NewDecoder(res.Body).Decode(&data) != nil || len(data.Errors) > 0 {
		writeErr(w, 502, "Reboot status unavailable")
		return
	}
	for _, l := range logins {
		out[strings.ToLower(l)] = "unknown"
	}
	for _, u := range data.Data.Users {
		out[strings.ToLower(u.Login)] = "not_started"
	}
	seen := map[string]bool{}
	for _, p := range data.Data.Progress {
		l := strings.ToLower(p.Login)
		if p.Done && p.Grade != nil && *p.Grade >= 1 {
			out[l] = "passed"
			seen[l] = true
			continue
		}
		if seen[l] {
			continue
		}
		seen[l] = true
		status := "working"
		if p.Done {
			status = "unknown"
			if p.Grade != nil {
				status = "failed"
				if *p.Grade >= 1 {
					status = "passed"
				}
			}
		}
		out[l] = status
	}
	writeJSON(w, 200, out)
}
