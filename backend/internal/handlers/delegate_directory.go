package handlers

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"taskflow/internal/utils"
	"time"
)

var directoryClient = &http.Client{Timeout: 15 * time.Second}

func directoryQuery(token, query string, variables any) (json.RawMessage, error) {
	body, _ := json.Marshal(map[string]any{"query": query, "variables": variables})
	req, err := http.NewRequest("POST", rebootSchoolURL()+"/api/graphql-engine/v1/graphql", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	res, err := directoryClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	var result struct {
		Data   json.RawMessage   `json:"data"`
		Errors []json.RawMessage `json:"errors"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(nil, res.Body, 2<<20)).Decode(&result); err != nil {
		return nil, err
	}
	if res.StatusCode != 200 || len(result.Errors) > 0 || len(result.Data) == 0 {
		return nil, fmt.Errorf("directory request denied (HTTP %d): %s", res.StatusCode, result.Errors)
	}
	return result.Data, nil
}

// Verify the signed token with Reboot before trusting its identity claims.
func verifiedDirectoryDelegate(token string) bool {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return false
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return false
	}
	var claims map[string]any
	if json.Unmarshal(payload, &claims) != nil {
		return false
	}
	login, _ := claims["login"].(string)
	if login == "" {
		login, _ = claims["sub"].(string)
	}
	if login == "" {
		return false
	}
	query := `query($login: String!) { user(where: {login: {_eq: $login}}, limit: 1) { login } }`
	vars := map[string]any{"login": login}
	if id, err := strconv.Atoi(login); err == nil {
		query = `query($id: Int!) { user(where: {id: {_eq: $id}}, limit: 1) { login } }`
		vars = map[string]any{"id": id}
	}
	data, err := directoryQuery(token, query, vars)
	if err != nil {
		return false
	}
	var result struct {
		User []struct {
			Login string `json:"login"`
		} `json:"user"`
	}
	if json.Unmarshal(data, &result) != nil || len(result.User) != 1 {
		return false
	}
	return isTemporaryAdmin(result.User[0].Login)
}

func (a *API) DelegateDirectory(w http.ResponseWriter, r *http.Request) {
	token := strings.TrimSpace(strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer "))
	if !verifiedDirectoryDelegate(token) {
		writeErr(w, http.StatusForbidden, "Reboot session is not authorized for delegated directory access")
		return
	}
	var req struct {
		Operation string `json:"operation"`
		Variables struct {
			Login  string   `json:"login"`
			Like   string   `json:"like"`
			Logins []string `json:"logins"`
		} `json:"variables"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 32768)
	if utils.ReadJSON(r, &req) != nil {
		writeErr(w, 400, "invalid request")
		return
	}
	query, ok := directoryQueries[req.Operation]
	if !ok {
		writeErr(w, 400, "unsupported lookup")
		return
	}
	if len(req.Variables.Logins) > 200 || len(req.Variables.Like) > 150 || len(req.Variables.Login) > 100 {
		writeErr(w, 400, "lookup too large")
		return
	}
	token, err := getRebootAdminToken()
	if err != nil {
		writeErr(w, 503, "Reboot directory service is not configured or unavailable")
		return
	}
	variables := map[string]any{}
	switch req.Operation {
	case "search":
		variables["like"] = req.Variables.Like
	case "phones":
		variables["logins"] = req.Variables.Logins
	case "user":
		variables["login"] = req.Variables.Login
	}
	data, err := directoryQuery(token, query, variables)
	if err != nil {
		writeErr(w, 502, "Reboot directory lookup failed")
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, 200, map[string]any{"data": data})
}

var directoryQueries = map[string]string{
	"search": `
    query SearchUsersForTaskFlow($like: String!) {
      user(
        where: {
          _or: [
            { login: { _ilike: $like } }
            { email: { _ilike: $like } }
            { firstName: { _ilike: $like } }
            { lastName: { _ilike: $like } }
          ]
        }
        limit: 8
        order_by: [{ login: asc }]
      ) {
        login
        email
        firstName
        lastName
      }
    }
  `,
	"user": `
    query GetUserForTaskflow($login: String!) {
      user(where: { login: { _eq: $login } }, limit: 1) {
        email
        firstName
        lastName
        login
      }
      myModuleEvents: event_user(
        where: {
          userLogin: { _eq: $login }
          event: { path: { _eq: "/bahrain/bh-module" } }
        }
        order_by: [{ eventId: asc }]
      ) {
        eventId
      }
      allModuleCohortEvents: event_user(
        where: { event: { path: { _eq: "/bahrain/bh-module" } } }
        distinct_on: eventId
        order_by: [{ eventId: asc }]
      ) {
        eventId
      }
    }
  `,
	"phones": `
    query UserPhones($logins: [String!]) {
      user(where: { login: { _in: $logins } }) {
        login
        number: attrs(path: "PhoneNumber")
      }
    }
  `,
}
