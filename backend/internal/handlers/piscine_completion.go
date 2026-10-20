package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

type piscineProgressRecord struct {
	Login     string   `json:"userLogin"`
	Path      string   `json:"path"`
	Grade     *float64 `json:"grade"`
	Done      bool     `json:"isDone"`
	UpdatedAt string   `json:"updatedAt"`
}

type piscineCompletion struct {
	status map[string]string
	passed map[string]time.Time
}

// Use dated passing results rather than the time TaskFlow happened to sync them.
// A successful old attempt still counts when newer retries exist.
func piscineCompletions(users []string, progress []piscineProgressRecord) map[string]piscineCompletion {
	out := map[string]piscineCompletion{}
	for _, login := range users {
		out[strings.ToLower(login)] = piscineCompletion{map[string]string{"rust": "not_started", "js": "not_started"}, map[string]time.Time{}}
	}
	for _, record := range progress {
		login := strings.ToLower(record.Login)
		entry, ok := out[login]
		if !ok {
			continue
		}
		track := ""
		for _, candidate := range []string{"rust", "js"} {
			if strings.HasSuffix(record.Path, "/piscine-"+candidate) {
				track = candidate
			}
		}
		if track == "" {
			continue
		}
		entry.status[track] = mergeRustPiscineStatus(entry.status[track], record.Done, record.Grade)
		if record.Done && record.Grade != nil && *record.Grade >= 1 {
			passed, err := time.Parse(time.RFC3339Nano, record.UpdatedAt)
			if err == nil && !passed.After(time.Now()) {
				if prior := entry.passed[track]; prior.IsZero() || passed.Before(prior) {
					entry.passed[track] = passed
				}
			}
		}
	}
	return out
}

func (p piscineCompletion) resumeDate(month time.Time) time.Time {
	// Unknown or unfinished results must not silently remove an exclusion.
	for _, track := range []string{"rust", "js"} {
		status := p.status[track]
		if status != "passed" && status != "not_started" {
			return time.Time{}
		}
		if status == "passed" && p.passed[track].IsZero() {
			return time.Time{}
		}
	}
	// A monthly mark refers to the piscine taken in that month. Keep earlier
	// months excluded until their dated passing result, even when read later.
	end := month.AddDate(0, 1, 0)
	var within, next, prior time.Time
	for _, passed := range p.passed {
		if passed.Before(month) {
			if prior.IsZero() || passed.After(prior) {
				prior = passed
			}
		} else if passed.Before(end) {
			if within.IsZero() || passed.After(within) {
				within = passed
			}
		} else if next.IsZero() || passed.Before(next) {
			next = passed
		}
	}
	if !within.IsZero() {
		return within
	}
	if !next.IsZero() {
		return next
	}
	return prior
}

func fetchPiscineCompletions(ctx context.Context, logins []string) (map[string]piscineCompletion, error) {
	token, err := getRebootAdminToken()
	if err != nil {
		return nil, err
	}
	payload, _ := json.Marshal(map[string]any{"query": `query PiscineCompletionDates($logins:[String!]!) { user(where:{login:{_in:$logins}}){login} progress(where:{userLogin:{_in:$logins},_or:[{path:{_like:"%/piscine-rust"}},{path:{_like:"%/piscine-js"}}]},order_by:{updatedAt:desc}){userLogin path grade isDone updatedAt} }`, "variables": map[string]any{"logins": logins}})
	ctx, cancel := context.WithTimeout(ctx, 12*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, rebootSchoolURL()+"/api/graphql-engine/v1/graphql", bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	var result struct {
		Data struct {
			Users []struct {
				Login string `json:"login"`
			} `json:"user"`
			Progress []piscineProgressRecord `json:"progress"`
		} `json:"data"`
		Errors []any `json:"errors"`
	}
	if res.StatusCode != 200 || json.NewDecoder(res.Body).Decode(&result) != nil || len(result.Errors) > 0 {
		return nil, fmt.Errorf("piscine completion dates unavailable")
	}
	found := []string{}
	for _, user := range result.Data.Users {
		found = append(found, user.Login)
	}
	return piscineCompletions(found, result.Data.Progress), nil
}

// Called after staff access is checked. Resolve relevant stored marks in one
// upstream batch; retain unresolved marks on network errors, never guess dates.
func (a *API) syncPiscineExclusions(ctx context.Context, scope, userID int64) error {
	rows, err := a.conn.Query(`SELECT DISTINCT pe.student_user_id,IFNULL(u.nickname,''),pe.month
 FROM piscine_report_exclusions pe JOIN users u ON u.id=pe.student_user_id
 WHERE pe.resumed_at='' AND (?=0 OR pe.student_user_id=?) AND (?=0 OR EXISTS(SELECT 1 FROM supervisor_students ss WHERE ss.student_user_id=u.id AND ss.supervisor_user_id=?))`, userID, userID, scope, scope)
	if err != nil {
		return err
	}
	type mark struct {
		id           int64
		login, month string
	}
	marks := []mark{}
	logins := []string{}
	seen := map[string]bool{}
	for rows.Next() {
		var m mark
		if err = rows.Scan(&m.id, &m.login, &m.month); err != nil {
			rows.Close()
			return err
		}
		if m.login == "" {
			continue
		}
		marks = append(marks, m)
		if !seen[m.login] {
			logins = append(logins, m.login)
			seen[m.login] = true
		}
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	if len(logins) == 0 {
		return nil
	}
	completions, err := fetchPiscineCompletions(ctx, logins)
	if err != nil {
		return err
	}
	for _, m := range marks {
		month, err := time.ParseInLocation("2006-01", m.month, time.FixedZone("Asia/Bahrain", 10800))
		if err != nil {
			continue
		}
		resume := completions[strings.ToLower(m.login)].resumeDate(month)
		if resume.IsZero() {
			continue
		}
		if _, err = a.conn.Exec(`UPDATE piscine_report_exclusions SET resumed_at=? WHERE student_user_id=? AND month=? AND resumed_at=''`, resume.UTC().Format(time.RFC3339), m.id, m.month); err != nil {
			return err
		}
	}
	return nil
}
