package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
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
	payload, _ := json.Marshal(map[string]any{"query": `query ProfileDetails($login: String!) { user(where: {login: {_eq: $login}}, limit: 1) { auditRatio attrs } }`, "variables": map[string]string{"login": login}})
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
			User []map[string]any `json:"user"`
		} `json:"data"`
	}
	if res.StatusCode != http.StatusOK || json.NewDecoder(res.Body).Decode(&result) != nil || len(result.Data.User) == 0 {
		return nil
	}
	user := result.Data.User[0]
	details := map[string]any{"auditRatio": user["auditRatio"]}
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
