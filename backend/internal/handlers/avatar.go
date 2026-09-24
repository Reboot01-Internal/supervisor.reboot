package handlers

import (
	"bytes"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
)

var rebootAdminTokenCache = struct {
	sync.Mutex
	token     string
	expiresAt time.Time
}{}

func rebootSchoolURL() string {
	return strings.TrimRight(strings.TrimSpace(os.Getenv("SCHOOL_URL")), "/")
}

func rebootBootstrapToken() string {
	return strings.TrimSpace(os.Getenv("TOKEN"))
}

func rebootSchoolEmail() string {
	return strings.TrimSpace(os.Getenv("SCHOOL_EMAIL"))
}

func rebootSchoolPassword() string {
	return strings.TrimSpace(os.Getenv("SCHOOL_PASSWORD"))
}

func parseRebootToken(body []byte) string {
	var tokenString string
	if err := json.Unmarshal(body, &tokenString); err == nil {
		return strings.TrimSpace(tokenString)
	}

	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err != nil {
		return strings.Trim(strings.TrimSpace(string(body)), `"`)
	}
	for _, key := range []string{"token", "access_token", "jwt"} {
		if value, ok := payload[key].(string); ok && strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	if nested, ok := payload["data"].(map[string]any); ok {
		for _, key := range []string{"token", "access_token", "jwt"} {
			if value, ok := nested[key].(string); ok && strings.TrimSpace(value) != "" {
				return strings.TrimSpace(value)
			}
		}
	}
	return ""
}

func getRebootAdminToken() (string, error) {
	schoolURL := rebootSchoolURL()
	bootstrapToken := rebootBootstrapToken()
	schoolEmail := rebootSchoolEmail()
	schoolPassword := rebootSchoolPassword()
	if schoolURL == "" || (bootstrapToken == "" && (schoolEmail == "" || schoolPassword == "")) {
		return "", fmt.Errorf("SCHOOL_URL and TOKEN or SCHOOL_EMAIL/SCHOOL_PASSWORD are required")
	}

	rebootAdminTokenCache.Lock()
	if rebootAdminTokenCache.token != "" && time.Now().Before(rebootAdminTokenCache.expiresAt) {
		token := rebootAdminTokenCache.token
		rebootAdminTokenCache.Unlock()
		log.Printf("avatar: using cached reboot admin token")
		return token, nil
	}
	rebootAdminTokenCache.Unlock()

	var req *http.Request
	var err error
	if bootstrapToken != "" {
		log.Printf("avatar: requesting reboot admin token using TOKEN at %s", schoolURL)
		u, err := url.Parse(schoolURL + "/api/auth/token")
		if err != nil {
			return "", err
		}
		q := u.Query()
		q.Set("token", bootstrapToken)
		u.RawQuery = q.Encode()

		req, err = http.NewRequest(http.MethodGet, u.String(), nil)
		if err != nil {
			return "", err
		}
	} else {
		log.Printf("avatar: requesting reboot admin token using SCHOOL_EMAIL at %s", schoolURL)
		req, err = http.NewRequest(http.MethodPost, schoolURL+"/api/auth/signin", nil)
		if err != nil {
			return "", err
		}
		encoded := base64.StdEncoding.EncodeToString([]byte(schoolEmail + ":" + schoolPassword))
		req.Header.Set("Authorization", "Basic "+encoded)
		req.Header.Set("Content-Type", "application/json")
	}
	res, err := (&http.Client{Timeout: 15 * time.Second}).Do(req)
	if err != nil {
		log.Printf("avatar: admin token request failed: %v", err)
		return "", err
	}
	defer res.Body.Close()

	body, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		log.Printf("avatar: admin token request returned status %d", res.StatusCode)
		return "", fmt.Errorf("admin token request failed")
	}
	token := parseRebootToken(body)
	if token == "" {
		log.Printf("avatar: admin token response did not include a token")
		return "", fmt.Errorf("admin token response did not include a token")
	}

	rebootAdminTokenCache.Lock()
	rebootAdminTokenCache.token = token
	rebootAdminTokenCache.expiresAt = time.Now().Add(20 * time.Minute)
	rebootAdminTokenCache.Unlock()

	log.Printf("avatar: reboot admin token loaded")
	return token, nil
}

func avatarFileIDFromAttrs(attrs any) string {
	switch value := attrs.(type) {
	case map[string]any:
		if fileID, ok := value["pro-picUploadId"].(string); ok {
			return strings.TrimSpace(fileID)
		}
	case string:
		var parsed map[string]any
		if err := json.Unmarshal([]byte(value), &parsed); err == nil {
			return avatarFileIDFromAttrs(parsed)
		}
	}
	return ""
}

type rebootAvatarRef struct {
	RebootUserID int64
	Login        string
	FileID       string
}

func fetchRebootAvatarRefByLogin(adminToken, login string) (rebootAvatarRef, error) {
	schoolURL := rebootSchoolURL()
	if schoolURL == "" {
		return rebootAvatarRef{}, fmt.Errorf("SCHOOL_URL is required")
	}

	query := `
		query avatar_by_login($login: String!) {
			user(where: { login: { _eq: $login } }, limit: 1) {
				id
				login
				attrs
			}
		}
	`
	payload := map[string]any{
		"query":     query,
		"variables": map[string]any{"login": login},
	}
	body, _ := json.Marshal(payload)

	req, err := http.NewRequest(http.MethodPost, schoolURL+"/api/graphql-engine/v1/graphql", bytes.NewReader(body))
	if err != nil {
		return rebootAvatarRef{}, err
	}
	req.Header.Set("Authorization", "Bearer "+adminToken)
	req.Header.Set("Content-Type", "application/json")

	res, err := (&http.Client{Timeout: 15 * time.Second}).Do(req)
	if err != nil {
		log.Printf("avatar: graphql request failed for login=%s: %v", login, err)
		return rebootAvatarRef{}, err
	}
	defer res.Body.Close()

	resBody, _ := io.ReadAll(io.LimitReader(res.Body, 2<<20))
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		log.Printf("avatar: graphql returned status %d for login=%s", res.StatusCode, login)
		return rebootAvatarRef{}, fmt.Errorf("avatar query failed")
	}

	var parsed struct {
		Data struct {
			User []struct {
				ID    int64  `json:"id"`
				Login string `json:"login"`
				Attrs any    `json:"attrs"`
			} `json:"user"`
		} `json:"data"`
		Errors []any `json:"errors"`
	}
	if err := json.Unmarshal(resBody, &parsed); err != nil {
		log.Printf("avatar: graphql response parse failed for login=%s: %v", login, err)
		return rebootAvatarRef{}, err
	}
	if len(parsed.Errors) > 0 {
		log.Printf("avatar: graphql returned errors for login=%s", login)
		return rebootAvatarRef{}, fmt.Errorf("avatar query returned errors")
	}
	if len(parsed.Data.User) == 0 {
		log.Printf("avatar: no reboot user found for login=%s", login)
		return rebootAvatarRef{}, nil
	}
	user := parsed.Data.User[0]
	fileID := avatarFileIDFromAttrs(user.Attrs)
	if fileID == "" {
		log.Printf("avatar: no pro-picUploadId found for login=%s", login)
	} else {
		log.Printf("avatar: found avatar file for login=%s reboot_user_id=%d", login, user.ID)
	}
	return rebootAvatarRef{
		RebootUserID: user.ID,
		Login:        strings.ToLower(strings.TrimSpace(firstNonEmpty(user.Login, login))),
		FileID:       fileID,
	}, nil
}

func fetchRebootAvatarRefByID(adminToken string, rebootUserID int64) (rebootAvatarRef, error) {
	schoolURL := rebootSchoolURL()
	if schoolURL == "" {
		return rebootAvatarRef{}, fmt.Errorf("SCHOOL_URL is required")
	}

	query := `
		query avatar_by_id($id: Int!) {
			user(where: { id: { _eq: $id } }, limit: 1) {
				id
				login
				attrs
			}
		}
	`
	payload := map[string]any{
		"query":     query,
		"variables": map[string]any{"id": rebootUserID},
	}
	body, _ := json.Marshal(payload)

	req, err := http.NewRequest(http.MethodPost, schoolURL+"/api/graphql-engine/v1/graphql", bytes.NewReader(body))
	if err != nil {
		return rebootAvatarRef{}, err
	}
	req.Header.Set("Authorization", "Bearer "+adminToken)
	req.Header.Set("Content-Type", "application/json")

	res, err := (&http.Client{Timeout: 15 * time.Second}).Do(req)
	if err != nil {
		log.Printf("avatar: graphql request failed for reboot_user_id=%d: %v", rebootUserID, err)
		return rebootAvatarRef{}, err
	}
	defer res.Body.Close()

	resBody, _ := io.ReadAll(io.LimitReader(res.Body, 2<<20))
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		log.Printf("avatar: graphql returned status %d for reboot_user_id=%d", res.StatusCode, rebootUserID)
		return rebootAvatarRef{}, fmt.Errorf("avatar query failed")
	}

	var parsed struct {
		Data struct {
			User []struct {
				ID    int64  `json:"id"`
				Login string `json:"login"`
				Attrs any    `json:"attrs"`
			} `json:"user"`
		} `json:"data"`
		Errors []any `json:"errors"`
	}
	if err := json.Unmarshal(resBody, &parsed); err != nil {
		log.Printf("avatar: graphql response parse failed for reboot_user_id=%d: %v", rebootUserID, err)
		return rebootAvatarRef{}, err
	}
	if len(parsed.Errors) > 0 {
		log.Printf("avatar: graphql returned errors for reboot_user_id=%d", rebootUserID)
		return rebootAvatarRef{}, fmt.Errorf("avatar query returned errors")
	}
	if len(parsed.Data.User) == 0 {
		log.Printf("avatar: no reboot user found for reboot_user_id=%d", rebootUserID)
		return rebootAvatarRef{}, nil
	}

	user := parsed.Data.User[0]
	fileID := avatarFileIDFromAttrs(user.Attrs)
	return rebootAvatarRef{
		RebootUserID: user.ID,
		Login:        strings.ToLower(strings.TrimSpace(user.Login)),
		FileID:       fileID,
	}, nil
}

func (a *API) serveRebootAvatar(w http.ResponseWriter, r *http.Request, ref rebootAvatarRef) {
	if ref.FileID == "" || ref.RebootUserID == 0 {
		log.Printf("avatar: incomplete avatar ref login=%s reboot_user_id=%d", ref.Login, ref.RebootUserID)
		http.Error(w, "avatar not found", http.StatusNotFound)
		return
	}

	adminToken, err := getRebootAdminToken()
	if err != nil {
		log.Printf("avatar: service not configured or token unavailable for login=%s: %v", ref.Login, err)
		http.Error(w, "avatar service is not configured", http.StatusServiceUnavailable)
		return
	}

	schoolURL := rebootSchoolURL()
	u, err := url.Parse(schoolURL + "/api/storage")
	if err != nil {
		http.Error(w, "bad storage url", http.StatusInternalServerError)
		return
	}
	q := u.Query()
	q.Set("token", adminToken)
	q.Set("fileId", ref.FileID)
	q.Set("userId", fmt.Sprintf("%d", ref.RebootUserID))
	u.RawQuery = q.Encode()

	res, err := http.Get(u.String())
	if err != nil {
		log.Printf("avatar: storage fetch failed for login=%s reboot_user_id=%d: %v", ref.Login, ref.RebootUserID, err)
		http.Error(w, "avatar fetch failed", http.StatusBadGateway)
		return
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		log.Printf("avatar: storage returned status %d for login=%s reboot_user_id=%d", res.StatusCode, ref.Login, ref.RebootUserID)
		http.Error(w, "avatar fetch failed", http.StatusBadGateway)
		return
	}

	contentType := res.Header.Get("Content-Type")
	if strings.TrimSpace(contentType) == "" {
		contentType = "image/jpeg"
	}
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Cache-Control", "private, max-age=3600")
	w.Header().Set("Vary", "Cookie")
	log.Printf("avatar: serving login=%s reboot_user_id=%d content_type=%s", ref.Login, ref.RebootUserID, contentType)
	_, _ = io.Copy(w, res.Body)
}

func (a *API) avatarByLogin(login string) (rebootAvatarRef, error) {
	login = strings.ToLower(strings.TrimSpace(login))
	if login == "" {
		return rebootAvatarRef{}, fmt.Errorf("login required")
	}
	adminToken, err := getRebootAdminToken()
	if err != nil {
		return rebootAvatarRef{}, err
	}
	return fetchRebootAvatarRefByLogin(adminToken, login)
}

func (a *API) rebootLoginForLocalUserID(userID int64) (string, error) {
	var nickname, email string
	err := a.conn.QueryRow(`
		SELECT IFNULL(nickname, ''), IFNULL(email, '')
		FROM users
		WHERE id = ?
	`, userID).Scan(&nickname, &email)
	if err != nil {
		return "", err
	}
	login := strings.TrimSpace(nickname)
	if login == "" {
		login = strings.Split(strings.TrimSpace(email), "@")[0]
	}
	return strings.ToLower(strings.TrimSpace(login)), nil
}

func (a *API) AdminRebootAvatar(w http.ResponseWriter, r *http.Request) {
	login := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("login")))
	if login == "" {
		http.Error(w, "login required", http.StatusBadRequest)
		return
	}
	log.Printf("avatar: request login=%s", login)

	ref, err := a.avatarByLogin(login)
	if err != nil || ref.FileID == "" || ref.RebootUserID == 0 {
		log.Printf("avatar: avatar not found for login=%s err=%v", login, err)
		http.Error(w, "avatar not found", http.StatusNotFound)
		return
	}

	a.serveRebootAvatar(w, r, ref)
}

func (a *API) CurrentRebootAvatar(w http.ResponseWriter, r *http.Request) {
	login := strings.ToLower(strings.TrimSpace(firstNonEmpty(
		r.Header.Get("X-User-Login"),
		r.URL.Query().Get("login"),
	)))
	if login == "" {
		email := strings.TrimSpace(firstNonEmpty(r.Header.Get("X-User-Email"), r.URL.Query().Get("email")))
		if email != "" {
			login = strings.ToLower(strings.TrimSpace(strings.Split(email, "@")[0]))
		}
	}
	if login == "" {
		http.Error(w, "login required", http.StatusBadRequest)
		return
	}

	ref, err := a.avatarByLogin(login)
	if err != nil || ref.FileID == "" || ref.RebootUserID == 0 {
		log.Printf("avatar: current avatar not found for login=%s err=%v", login, err)
		http.Error(w, "avatar not found", http.StatusNotFound)
		return
	}

	a.serveRebootAvatar(w, r, ref)
}

func (a *API) RebootAvatarByID(w http.ResponseWriter, r *http.Request) {
	rawID := strings.TrimSpace(chi.URLParam(r, "userID"))
	if rawID == "" {
		http.Error(w, "user id required", http.StatusBadRequest)
		return
	}
	var userID int64
	if _, err := fmt.Sscanf(rawID, "%d", &userID); err != nil || userID <= 0 {
		http.Error(w, "invalid user id", http.StatusBadRequest)
		return
	}

	adminToken, err := getRebootAdminToken()
	if err != nil {
		log.Printf("avatar: service not configured or token unavailable for user_id=%d: %v", userID, err)
		http.Error(w, "avatar service is not configured", http.StatusServiceUnavailable)
		return
	}

	var ref rebootAvatarRef
	login, localErr := a.rebootLoginForLocalUserID(userID)
	if localErr == nil && login != "" {
		ref, err = fetchRebootAvatarRefByLogin(adminToken, login)
	} else if localErr != nil && localErr != sql.ErrNoRows {
		log.Printf("avatar: local user lookup failed for user_id=%d: %v", userID, localErr)
	}
	if ref.FileID == "" || ref.RebootUserID == 0 {
		ref, err = fetchRebootAvatarRefByID(adminToken, userID)
	}
	if err != nil || ref.FileID == "" || ref.RebootUserID == 0 {
		log.Printf("avatar: avatar not found for user_id=%d err=%v", userID, err)
		http.Error(w, "avatar not found", http.StatusNotFound)
		return
	}

	a.serveRebootAvatar(w, r, ref)
}
