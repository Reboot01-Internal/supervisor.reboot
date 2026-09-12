package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"
)

// Only called after ProfileSummary has verified the viewer's admin identity.
// Service credentials stay on the server; missing upstream fields remain absent.
func fetchProfileDetails(r *http.Request, login string) map[string]any {
	if login == "" {
		return nil
	}
	token, err := getRebootAdminToken()
	if err != nil {
		return nil
	}
	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
	defer cancel()
	payload, _ := json.Marshal(map[string]any{"query": `query ProfileDetails($login: String!) { user(where: {login: {_eq: $login}}, limit: 1) { auditRatio attrs } group_user(where:{userLogin:{_eq:$login},accepted:{_eq:true}},order_by:{group:{updatedAt:desc}}) { group { id status path updatedAt object { name type } progresses(where:{userLogin:{_eq:$login}},order_by:{updatedAt:desc},limit:1) { grade isDone } } } progress(where:{userLogin:{_eq:$login},path:{_like:"%/piscine-%"}},order_by:{updatedAt:desc}) { id path updatedAt grade isDone object { name type } } }`, "variables": map[string]string{"login": login}})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, rebootSchoolURL()+"/api/graphql-engine/v1/graphql", bytes.NewReader(payload))
	if err != nil {
		return nil
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil
	}
	defer res.Body.Close()
	var result struct {
		Data struct {
			User     []map[string]any `json:"user"`
			Projects []map[string]any `json:"group_user"`
			Piscines []map[string]any `json:"progress"`
		} `json:"data"`
	}
	if res.StatusCode != http.StatusOK || json.NewDecoder(res.Body).Decode(&result) != nil || len(result.Data.User) == 0 {
		return nil
	}
	// Only the piscine's own progress determines its overall result, not exercises.
	for _, p := range result.Data.Piscines {
		path, _ := p["path"].(string)
		parts := strings.Split(strings.TrimRight(path, "/"), "/")
		if !strings.HasPrefix(parts[len(parts)-1], "piscine-") {
			continue
		}
		status := "working"
		if done, _ := p["isDone"].(bool); done {
			status = "finished"
		}
		result.Data.Projects = append(result.Data.Projects, map[string]any{"group": map[string]any{
			"id": p["id"], "status": status, "path": path, "updatedAt": p["updatedAt"], "object": p["object"], "isPiscine": true,
			"progresses": []any{map[string]any{"grade": p["grade"], "isDone": p["isDone"]}},
		}})
	}
	user := result.Data.User[0]
	details := map[string]any{"auditRatio": user["auditRatio"], "projects": result.Data.Projects}
	if attrs, ok := user["attrs"].(map[string]any); ok {
		safeAttrs := map[string]any{}
		for _, key := range []string{"gender", "genders", "sex", "Gender"} {
			if value, exists := attrs[key]; exists {
				safeAttrs[key] = value
			}
		}
		details["attrs"] = safeAttrs
	}
	return details
}
