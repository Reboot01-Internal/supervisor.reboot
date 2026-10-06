package handlers

import (
	"encoding/base64"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
)

// Reboot verifies the signature before its token claims are used as identity.
// Client-supplied identity/role headers are not sufficient for private punch records.
func (a *API) verifiedAttendanceAdmin(w http.ResponseWriter, r *http.Request) bool {
	token := strings.TrimSpace(strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer "))
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		writeErr(w, 403, "Sign in with your Reboot admin account to view attendance")
		return false
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		writeErr(w, 403, "Invalid Reboot session")
		return false
	}
	var claims map[string]any
	if json.Unmarshal(payload, &claims) != nil {
		writeErr(w, 403, "Invalid Reboot session")
		return false
	}
	identity, _ := claims["sub"].(string)
	if identity == "" {
		identity, _ = claims["login"].(string)
	}
	if identity == "" {
		writeErr(w, 403, "Invalid Reboot identity")
		return false
	}
	query := `query($login:String!){user(where:{login:{_eq:$login}},limit:1){login}}`
	vars := map[string]any{"login": identity}
	if id, e := strconv.Atoi(identity); e == nil {
		query = `query($id:Int!){user(where:{id:{_eq:$id}},limit:1){login}}`
		vars = map[string]any{"id": id}
	}
	data, err := directoryQuery(token, query, vars)
	if err != nil {
		writeErr(w, 403, "Could not verify your Reboot session. Sign in again and retry.")
		return false
	}
	var result struct {
		User []struct {
			Login string `json:"login"`
		} `json:"user"`
	}
	if json.Unmarshal(data, &result) != nil || len(result.User) != 1 {
		writeErr(w, 403, "Could not verify your Reboot identity")
		return false
	}
	verified := r.Clone(r.Context())
	verified.Header = r.Header.Clone()
	verified.Header.Set("X-User-Login", result.User[0].Login)
	return a.attendanceAdmin(w, verified)
}
