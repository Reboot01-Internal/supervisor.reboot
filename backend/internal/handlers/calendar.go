package handlers

import (
	"bytes"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"taskflow/internal/db"
	"taskflow/internal/models"
)

type startCalendarConnectionReq struct {
	Provider string `json:"provider"`
	Email    string `json:"email"`
}

type disconnectCalendarConnectionReq struct {
	Provider string `json:"provider"`
}

type calendarOAuthToken struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	TokenType    string `json:"token_type"`
	Scope        string `json:"scope"`
	ExpiresIn    int    `json:"expires_in"`
	IDToken      string `json:"id_token"`
}

type googleUserProfile struct {
	Email string `json:"email"`
	Name  string `json:"name"`
}

type googleEventsResponse struct {
	Items []struct {
		ID     string `json:"id"`
		Status string `json:"status"`
		Start  struct {
			DateTime string `json:"dateTime"`
		} `json:"start"`
		End struct {
			DateTime string `json:"dateTime"`
		} `json:"end"`
	} `json:"items"`
}

type microsoftProfile struct {
	Mail              string `json:"mail"`
	UserPrincipalName string `json:"userPrincipalName"`
	DisplayName       string `json:"displayName"`
}

type microsoftEventsResponse struct {
	Value []struct {
		ID          string `json:"id"`
		IsCancelled bool   `json:"isCancelled"`
		ShowAs      string `json:"showAs"`
		Start       struct {
			DateTime string `json:"dateTime"`
		} `json:"start"`
		End struct {
			DateTime string `json:"dateTime"`
		} `json:"end"`
	} `json:"value"`
}

func normalizeCalendarProvider(provider string) string {
	switch strings.ToLower(strings.TrimSpace(provider)) {
	case "google":
		return "google"
	case "microsoft", "outlook":
		return "microsoft"
	default:
		return ""
	}
}

func calendarProviderLabel(provider string) string {
	switch normalizeCalendarProvider(provider) {
	case "google":
		return "Google Calendar"
	case "microsoft":
		return "Outlook Calendar"
	default:
		return "Calendar"
	}
}

func (a *API) ListCalendarConnections(w http.ResponseWriter, r *http.Request) {
	role := normalizeRole(r.Header.Get("X-User-Role"))
	if role != "admin" && role != "supervisor" && role != "student" {
		writeErr(w, http.StatusForbidden, "forbidden")
		return
	}

	items, err := db.ListCalendarConnectionsByUser(a.conn, actorID(r, a.conn))
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "failed to load calendar connections")
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (a *API) StartCalendarConnection(w http.ResponseWriter, r *http.Request) {
	role := normalizeRole(r.Header.Get("X-User-Role"))
	if role != "admin" && role != "supervisor" && role != "student" {
		writeErr(w, http.StatusForbidden, "forbidden")
		return
	}

	var req startCalendarConnectionReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "bad json")
		return
	}

	provider := normalizeCalendarProvider(req.Provider)
	if provider == "" {
		writeErr(w, http.StatusBadRequest, "invalid provider")
		return
	}
	if err := a.ensureCalendarProviderConfigured(provider); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}

	stateToken, err := randomHex(24)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "failed to initialize calendar linking")
		return
	}
	if err := db.CreateCalendarOAuthState(a.conn, stateToken, actorID(r, a.conn), provider, strings.TrimSpace(req.Email)); err != nil {
		writeErr(w, http.StatusInternalServerError, "failed to initialize calendar linking")
		return
	}

	authURL, err := a.calendarAuthURL(provider, stateToken, strings.TrimSpace(req.Email))
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"auth_url": authURL,
		"provider": provider,
	})
}

func (a *API) CompleteCalendarConnection(w http.ResponseWriter, r *http.Request) {
	stateToken := strings.TrimSpace(r.URL.Query().Get("state"))
	if stateToken == "" {
		a.renderCalendarCallback(w, false, "Missing calendar state.")
		return
	}

	if providerErr := strings.TrimSpace(r.URL.Query().Get("error")); providerErr != "" {
		a.renderCalendarCallback(w, false, "Calendar authorization was canceled.")
		return
	}

	code := strings.TrimSpace(r.URL.Query().Get("code"))
	if code == "" {
		a.renderCalendarCallback(w, false, "Missing calendar authorization code.")
		return
	}

	userID, provider, loginHint, err := db.ConsumeCalendarOAuthState(a.conn, stateToken)
	if err != nil {
		a.renderCalendarCallback(w, false, "This calendar link has expired. Please try again.")
		return
	}

	token, err := a.exchangeCalendarCode(provider, code)
	if err != nil {
		a.renderCalendarCallback(w, false, err.Error())
		return
	}

	accountEmail, calendarName, err := a.fetchCalendarProfile(provider, token.AccessToken)
	if err != nil {
		a.renderCalendarCallback(w, false, err.Error())
		return
	}
	if strings.TrimSpace(accountEmail) == "" {
		accountEmail = strings.TrimSpace(loginHint)
	}

	accessToken, err := a.sealCalendarSecret(token.AccessToken)
	if err != nil {
		a.renderCalendarCallback(w, false, "Failed to store calendar access token.")
		return
	}
	refreshToken, err := a.sealCalendarSecret(token.RefreshToken)
	if err != nil {
		a.renderCalendarCallback(w, false, "Failed to store calendar refresh token.")
		return
	}

	expiresAt := ""
	if token.ExpiresIn > 0 {
		expiresAt = time.Now().UTC().Add(time.Duration(token.ExpiresIn) * time.Second).Format(time.RFC3339)
	}

	connectionID, err := db.UpsertCalendarConnection(
		a.conn,
		userID,
		provider,
		accountEmail,
		"primary",
		firstNonEmpty(calendarName, "Primary calendar"),
		accessToken,
		refreshToken,
		firstNonEmpty(token.TokenType, "Bearer"),
		token.Scope,
		expiresAt,
		"connected",
		"",
	)
	if err != nil {
		a.renderCalendarCallback(w, false, "Failed to save calendar connection.")
		return
	}
	_ = db.MarkCalendarConnectionSynced(a.conn, connectionID)
	a.renderCalendarCallback(w, true, fmt.Sprintf("%s linked successfully.", calendarProviderLabel(provider)))
}

func (a *API) DisconnectCalendarConnection(w http.ResponseWriter, r *http.Request) {
	role := normalizeRole(r.Header.Get("X-User-Role"))
	if role != "admin" && role != "supervisor" && role != "student" {
		writeErr(w, http.StatusForbidden, "forbidden")
		return
	}

	var req disconnectCalendarConnectionReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "bad json")
		return
	}
	provider := normalizeCalendarProvider(req.Provider)
	if provider == "" {
		writeErr(w, http.StatusBadRequest, "invalid provider")
		return
	}

	if err := db.DeleteCalendarConnection(a.conn, actorID(r, a.conn), provider); err != nil {
		writeErr(w, http.StatusInternalServerError, "failed to disconnect calendar")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (a *API) ensureCalendarAvailability(userID, meetingID int64, startsAt, endsAt string) error {
	connections, err := db.ListCalendarConnectionsByUser(a.conn, userID)
	if err != nil {
		return errors.New("failed to load linked calendar")
	}
	for _, connection := range connections {
		if connection.Status != "connected" {
			continue
		}
		linkedEvent, err := db.GetMeetingCalendarEvent(a.conn, meetingID, connection.Provider)
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			return errors.New("failed to inspect calendar sync state")
		}
		hasConflict, err := a.calendarConnectionHasConflict(connection, linkedEvent.ExternalEventID, startsAt, endsAt)
		if err != nil {
			_ = db.UpdateCalendarConnectionTokens(a.conn, connection.ID, "", "", "", "", "", "attention", err.Error())
			return fmt.Errorf("failed to check %s availability", strings.ToLower(calendarProviderLabel(connection.Provider)))
		}
		if hasConflict {
			_ = db.MarkCalendarConnectionConflict(a.conn, connection.ID, "Busy during requested time")
			return fmt.Errorf("%s is already busy during that time", calendarProviderLabel(connection.Provider))
		}
	}
	return nil
}

func (a *API) syncMeetingToLinkedCalendars(userID int64, meeting models.Meeting) string {
	connections, err := db.ListCalendarConnectionsByUser(a.conn, userID)
	if err != nil {
		return "Failed to load linked calendars."
	}

	var errs []string
	for _, connection := range connections {
		if connection.Status != "connected" {
			continue
		}
		if err := a.syncMeetingToCalendar(connection, meeting); err != nil {
			errs = append(errs, fmt.Sprintf("%s: %s", calendarProviderLabel(connection.Provider), err.Error()))
		}
	}
	return strings.Join(errs, " ")
}

func (a *API) deleteMeetingFromLinkedCalendars(userID int64, meetingID int64) {
	connections, err := db.ListCalendarConnectionsByUser(a.conn, userID)
	if err != nil {
		return
	}
	for _, connection := range connections {
		if connection.Status != "connected" {
			continue
		}
		if err := a.deleteMeetingFromCalendar(connection, meetingID); err != nil {
			log.Printf("calendar delete sync failed: meeting=%d provider=%s err=%v", meetingID, connection.Provider, err)
		}
	}
	_ = db.DeleteMeetingCalendarEvents(a.conn, meetingID)
}

func (a *API) syncMeetingToCalendar(connection models.CalendarConnection, meeting models.Meeting) error {
	if meeting.Status == "canceled" {
		return a.deleteMeetingFromCalendar(connection, meeting.ID)
	}

	linkedEvent, err := db.GetMeetingCalendarEvent(a.conn, meeting.ID, connection.Provider)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return err
	}

	accessToken, refreshedConnection, err := a.ensureCalendarAccessToken(connection)
	if err != nil {
		return err
	}
	connection = refreshedConnection

	externalEventID := strings.TrimSpace(linkedEvent.ExternalEventID)
	switch connection.Provider {
	case "google":
		externalEventID, err = a.upsertGoogleCalendarEvent(connection, accessToken, meeting, externalEventID)
	case "microsoft":
		externalEventID, err = a.upsertMicrosoftCalendarEvent(connection, accessToken, meeting, externalEventID)
	default:
		err = errors.New("unsupported calendar provider")
	}
	if err != nil {
		_ = db.UpsertMeetingCalendarEvent(a.conn, meeting.ID, connection.ID, connection.Provider, connection.CalendarID, externalEventID, "error", err.Error())
		_ = db.UpdateCalendarConnectionTokens(a.conn, connection.ID, "", "", "", "", "", "attention", err.Error())
		return err
	}

	_ = db.UpsertMeetingCalendarEvent(a.conn, meeting.ID, connection.ID, connection.Provider, connection.CalendarID, externalEventID, "ok", "")
	_ = db.MarkCalendarConnectionSynced(a.conn, connection.ID)
	return nil
}

func (a *API) deleteMeetingFromCalendar(connection models.CalendarConnection, meetingID int64) error {
	linkedEvent, err := db.GetMeetingCalendarEvent(a.conn, meetingID, connection.Provider)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil
		}
		return err
	}
	if strings.TrimSpace(linkedEvent.ExternalEventID) == "" {
		return nil
	}

	accessToken, refreshedConnection, err := a.ensureCalendarAccessToken(connection)
	if err != nil {
		return err
	}
	connection = refreshedConnection

	switch connection.Provider {
	case "google":
		err = a.deleteGoogleCalendarEvent(connection, accessToken, linkedEvent.ExternalEventID)
	case "microsoft":
		err = a.deleteMicrosoftCalendarEvent(connection, accessToken, linkedEvent.ExternalEventID)
	default:
		err = errors.New("unsupported calendar provider")
	}
	if err != nil {
		_ = db.UpsertMeetingCalendarEvent(a.conn, meetingID, connection.ID, connection.Provider, connection.CalendarID, linkedEvent.ExternalEventID, "error", err.Error())
		return err
	}
	_ = db.UpsertMeetingCalendarEvent(a.conn, meetingID, connection.ID, connection.Provider, connection.CalendarID, "", "deleted", "")
	return nil
}

func (a *API) calendarConnectionHasConflict(connection models.CalendarConnection, ignoreEventID, startsAt, endsAt string) (bool, error) {
	accessToken, refreshedConnection, err := a.ensureCalendarAccessToken(connection)
	if err != nil {
		return false, err
	}
	connection = refreshedConnection

	switch connection.Provider {
	case "google":
		return a.googleCalendarHasConflict(connection, accessToken, ignoreEventID, startsAt, endsAt)
	case "microsoft":
		return a.microsoftCalendarHasConflict(connection, accessToken, ignoreEventID, startsAt, endsAt)
	default:
		return false, errors.New("unsupported calendar provider")
	}
}

func (a *API) googleCalendarHasConflict(connection models.CalendarConnection, accessToken, ignoreEventID, startsAt, endsAt string) (bool, error) {
	values := url.Values{}
	values.Set("singleEvents", "true")
	values.Set("timeMin", startsAt)
	values.Set("timeMax", endsAt)
	values.Set("maxResults", "50")
	values.Set("orderBy", "startTime")

	endpoint := fmt.Sprintf("https://www.googleapis.com/calendar/v3/calendars/%s/events?%s", url.PathEscape(calendarIDOf(connection)), values.Encode())
	req, _ := http.NewRequest(http.MethodGet, endpoint, nil)
	req.Header.Set("Authorization", "Bearer "+accessToken)

	var res googleEventsResponse
	if err := a.httpJSON(req, &res); err != nil {
		return false, err
	}

	requestStart, err := time.Parse(time.RFC3339, startsAt)
	if err != nil {
		return false, err
	}
	requestEnd, err := time.Parse(time.RFC3339, endsAt)
	if err != nil {
		return false, err
	}

	for _, item := range res.Items {
		if item.Status == "cancelled" || strings.TrimSpace(item.ID) == strings.TrimSpace(ignoreEventID) {
			continue
		}
		itemStart, err := time.Parse(time.RFC3339, strings.TrimSpace(item.Start.DateTime))
		if err != nil {
			continue
		}
		itemEnd, err := time.Parse(time.RFC3339, strings.TrimSpace(item.End.DateTime))
		if err != nil {
			continue
		}
		if itemStart.Before(requestEnd) && itemEnd.After(requestStart) {
			return true, nil
		}
	}
	return false, nil
}

func (a *API) microsoftCalendarHasConflict(connection models.CalendarConnection, accessToken, ignoreEventID, startsAt, endsAt string) (bool, error) {
	values := url.Values{}
	values.Set("startDateTime", startsAt)
	values.Set("endDateTime", endsAt)
	values.Set("$top", "50")
	values.Set("$select", "id,showAs,start,end,isCancelled")
	values.Set("$orderby", "start/dateTime")

	req, _ := http.NewRequest(http.MethodGet, "https://graph.microsoft.com/v1.0/me/calendarView?"+values.Encode(), nil)
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Prefer", `outlook.timezone="UTC"`)

	var res microsoftEventsResponse
	if err := a.httpJSON(req, &res); err != nil {
		return false, err
	}

	requestStart, err := time.Parse(time.RFC3339, startsAt)
	if err != nil {
		return false, err
	}
	requestEnd, err := time.Parse(time.RFC3339, endsAt)
	if err != nil {
		return false, err
	}

	for _, item := range res.Value {
		if item.IsCancelled || strings.EqualFold(strings.TrimSpace(item.ShowAs), "free") || strings.TrimSpace(item.ID) == strings.TrimSpace(ignoreEventID) {
			continue
		}
		itemStart, err := parseFlexibleRFC3339(item.Start.DateTime)
		if err != nil {
			continue
		}
		itemEnd, err := parseFlexibleRFC3339(item.End.DateTime)
		if err != nil {
			continue
		}
		if itemStart.Before(requestEnd) && itemEnd.After(requestStart) {
			return true, nil
		}
	}
	return false, nil
}

func (a *API) upsertGoogleCalendarEvent(connection models.CalendarConnection, accessToken string, meeting models.Meeting, externalEventID string) (string, error) {
	body := map[string]any{
		"summary":     meeting.Title,
		"location":    meeting.Location,
		"description": buildCalendarEventDescription(meeting),
		"start": map[string]any{
			"dateTime": meeting.StartsAt,
		},
		"end": map[string]any{
			"dateTime": meeting.EndsAt,
		},
	}
	method := http.MethodPost
	endpoint := fmt.Sprintf("https://www.googleapis.com/calendar/v3/calendars/%s/events", url.PathEscape(calendarIDOf(connection)))
	if strings.TrimSpace(externalEventID) != "" {
		method = http.MethodPut
		endpoint = fmt.Sprintf("%s/%s", endpoint, url.PathEscape(strings.TrimSpace(externalEventID)))
	}

	payload, _ := json.Marshal(body)
	req, _ := http.NewRequest(method, endpoint, bytes.NewReader(payload))
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Content-Type", "application/json")

	var res struct {
		ID string `json:"id"`
	}
	if err := a.httpJSON(req, &res); err != nil {
		return "", err
	}
	return strings.TrimSpace(res.ID), nil
}

func (a *API) deleteGoogleCalendarEvent(connection models.CalendarConnection, accessToken, externalEventID string) error {
	endpoint := fmt.Sprintf("https://www.googleapis.com/calendar/v3/calendars/%s/events/%s", url.PathEscape(calendarIDOf(connection)), url.PathEscape(strings.TrimSpace(externalEventID)))
	req, _ := http.NewRequest(http.MethodDelete, endpoint, nil)
	req.Header.Set("Authorization", "Bearer "+accessToken)
	return a.httpNoContent(req)
}

func (a *API) upsertMicrosoftCalendarEvent(connection models.CalendarConnection, accessToken string, meeting models.Meeting, externalEventID string) (string, error) {
	body := map[string]any{
		"subject": meeting.Title,
		"location": map[string]any{
			"displayName": meeting.Location,
		},
		"body": map[string]any{
			"contentType": "text",
			"content":     buildCalendarEventDescription(meeting),
		},
		"start": map[string]any{
			"dateTime": meeting.StartsAt,
			"timeZone": "UTC",
		},
		"end": map[string]any{
			"dateTime": meeting.EndsAt,
			"timeZone": "UTC",
		},
	}
	method := http.MethodPost
	endpoint := "https://graph.microsoft.com/v1.0/me/events"
	if strings.TrimSpace(externalEventID) != "" {
		method = http.MethodPatch
		endpoint = endpoint + "/" + url.PathEscape(strings.TrimSpace(externalEventID))
	}

	payload, _ := json.Marshal(body)
	req, _ := http.NewRequest(method, endpoint, bytes.NewReader(payload))
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Content-Type", "application/json")

	var res struct {
		ID string `json:"id"`
	}
	if method == http.MethodPatch {
		if err := a.httpJSONOptionalBody(req, &res); err != nil {
			return "", err
		}
		if strings.TrimSpace(res.ID) == "" {
			return strings.TrimSpace(externalEventID), nil
		}
		return strings.TrimSpace(res.ID), nil
	}
	if err := a.httpJSON(req, &res); err != nil {
		return "", err
	}
	return strings.TrimSpace(res.ID), nil
}

func (a *API) deleteMicrosoftCalendarEvent(connection models.CalendarConnection, accessToken, externalEventID string) error {
	req, _ := http.NewRequest(http.MethodDelete, "https://graph.microsoft.com/v1.0/me/events/"+url.PathEscape(strings.TrimSpace(externalEventID)), nil)
	req.Header.Set("Authorization", "Bearer "+accessToken)
	return a.httpNoContent(req)
}

func (a *API) ensureCalendarAccessToken(connection models.CalendarConnection) (string, models.CalendarConnection, error) {
	connectionID := connection.ID
	accessTokenEnc, refreshTokenEnc, tokenType, scope, expiresAt, err := db.GetCalendarConnectionSecrets(a.conn, connectionID)
	if err != nil {
		return "", connection, err
	}

	accessToken, err := a.openCalendarSecret(accessTokenEnc)
	if err != nil {
		return "", connection, err
	}
	refreshToken, err := a.openCalendarSecret(refreshTokenEnc)
	if err != nil {
		return "", connection, err
	}

	expiresSoon := false
	if strings.TrimSpace(expiresAt) != "" {
		if parsed, err := time.Parse(time.RFC3339, expiresAt); err == nil {
			expiresSoon = parsed.Before(time.Now().UTC().Add(90 * time.Second))
		}
	}
	if strings.TrimSpace(accessToken) != "" && !expiresSoon {
		return accessToken, connection, nil
	}
	if strings.TrimSpace(refreshToken) == "" {
		return "", connection, errors.New("calendar session expired, reconnect the calendar")
	}

	refreshed, err := a.refreshCalendarToken(connection.Provider, refreshToken)
	if err != nil {
		return "", connection, err
	}
	accessToken = refreshed.AccessToken
	newRefreshToken := refreshed.RefreshToken
	if strings.TrimSpace(newRefreshToken) == "" {
		newRefreshToken = refreshToken
	}
	sealedAccessToken, err := a.sealCalendarSecret(accessToken)
	if err != nil {
		return "", connection, err
	}
	sealedRefreshToken, err := a.sealCalendarSecret(newRefreshToken)
	if err != nil {
		return "", connection, err
	}
	newExpiresAt := ""
	if refreshed.ExpiresIn > 0 {
		newExpiresAt = time.Now().UTC().Add(time.Duration(refreshed.ExpiresIn) * time.Second).Format(time.RFC3339)
	}
	if err := db.UpdateCalendarConnectionTokens(a.conn, connectionID, sealedAccessToken, sealedRefreshToken, firstNonEmpty(refreshed.TokenType, tokenType), firstNonEmpty(refreshed.Scope, scope), newExpiresAt, "connected", ""); err != nil {
		return "", connection, err
	}
	connection.Status = "connected"
	return accessToken, connection, nil
}

func (a *API) exchangeCalendarCode(provider, code string) (calendarOAuthToken, error) {
	values := url.Values{}
	values.Set("code", strings.TrimSpace(code))
	values.Set("redirect_uri", a.calendarCallbackURL())
	values.Set("grant_type", "authorization_code")

	var endpoint string
	switch provider {
	case "google":
		values.Set("client_id", strings.TrimSpace(os.Getenv("GOOGLE_CALENDAR_CLIENT_ID")))
		values.Set("client_secret", strings.TrimSpace(os.Getenv("GOOGLE_CALENDAR_CLIENT_SECRET")))
		endpoint = "https://oauth2.googleapis.com/token"
	case "microsoft":
		values.Set("client_id", strings.TrimSpace(os.Getenv("MICROSOFT_CALENDAR_CLIENT_ID")))
		values.Set("client_secret", strings.TrimSpace(os.Getenv("MICROSOFT_CALENDAR_CLIENT_SECRET")))
		values.Set("scope", "offline_access openid profile email User.Read Calendars.Read Calendars.ReadWrite")
		endpoint = "https://login.microsoftonline.com/common/oauth2/v2.0/token"
	default:
		return calendarOAuthToken{}, errors.New("unsupported calendar provider")
	}

	token, err := a.exchangeCalendarToken(endpoint, values)
	if err != nil {
		return calendarOAuthToken{}, err
	}
	return token, nil
}

func (a *API) refreshCalendarToken(provider, refreshToken string) (calendarOAuthToken, error) {
	values := url.Values{}
	values.Set("refresh_token", strings.TrimSpace(refreshToken))
	values.Set("redirect_uri", a.calendarCallbackURL())
	values.Set("grant_type", "refresh_token")

	var endpoint string
	switch provider {
	case "google":
		values.Set("client_id", strings.TrimSpace(os.Getenv("GOOGLE_CALENDAR_CLIENT_ID")))
		values.Set("client_secret", strings.TrimSpace(os.Getenv("GOOGLE_CALENDAR_CLIENT_SECRET")))
		endpoint = "https://oauth2.googleapis.com/token"
	case "microsoft":
		values.Set("client_id", strings.TrimSpace(os.Getenv("MICROSOFT_CALENDAR_CLIENT_ID")))
		values.Set("client_secret", strings.TrimSpace(os.Getenv("MICROSOFT_CALENDAR_CLIENT_SECRET")))
		values.Set("scope", "offline_access openid profile email User.Read Calendars.Read Calendars.ReadWrite")
		endpoint = "https://login.microsoftonline.com/common/oauth2/v2.0/token"
	default:
		return calendarOAuthToken{}, errors.New("unsupported calendar provider")
	}

	return a.exchangeCalendarToken(endpoint, values)
}

func (a *API) exchangeCalendarToken(endpoint string, values url.Values) (calendarOAuthToken, error) {
	req, _ := http.NewRequest(http.MethodPost, endpoint, strings.NewReader(values.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	var token calendarOAuthToken
	if err := a.httpJSON(req, &token); err != nil {
		return calendarOAuthToken{}, err
	}
	if strings.TrimSpace(token.AccessToken) == "" {
		return calendarOAuthToken{}, errors.New("calendar provider did not return an access token")
	}
	return token, nil
}

func (a *API) fetchCalendarProfile(provider, accessToken string) (email, calendarName string, err error) {
	switch provider {
	case "google":
		req, _ := http.NewRequest(http.MethodGet, "https://www.googleapis.com/oauth2/v2/userinfo", nil)
		req.Header.Set("Authorization", "Bearer "+accessToken)
		var profile googleUserProfile
		if err := a.httpJSON(req, &profile); err != nil {
			return "", "", err
		}
		return strings.TrimSpace(profile.Email), firstNonEmpty(strings.TrimSpace(profile.Name), "Primary calendar"), nil
	case "microsoft":
		req, _ := http.NewRequest(http.MethodGet, "https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName,displayName", nil)
		req.Header.Set("Authorization", "Bearer "+accessToken)
		var profile microsoftProfile
		if err := a.httpJSON(req, &profile); err != nil {
			return "", "", err
		}
		email := firstNonEmpty(strings.TrimSpace(profile.Mail), strings.TrimSpace(profile.UserPrincipalName))
		return email, firstNonEmpty(strings.TrimSpace(profile.DisplayName), "Primary calendar"), nil
	default:
		return "", "", errors.New("unsupported calendar provider")
	}
}

func (a *API) ensureCalendarProviderConfigured(provider string) error {
	switch provider {
	case "google":
		if strings.TrimSpace(os.Getenv("GOOGLE_CALENDAR_CLIENT_ID")) == "" || strings.TrimSpace(os.Getenv("GOOGLE_CALENDAR_CLIENT_SECRET")) == "" {
			return errors.New("Google Calendar is not configured on the server yet")
		}
	case "microsoft":
		if strings.TrimSpace(os.Getenv("MICROSOFT_CALENDAR_CLIENT_ID")) == "" || strings.TrimSpace(os.Getenv("MICROSOFT_CALENDAR_CLIENT_SECRET")) == "" {
			return errors.New("Outlook Calendar is not configured on the server yet")
		}
	default:
		return errors.New("unsupported calendar provider")
	}
	return nil
}

func (a *API) calendarAuthURL(provider, stateToken, loginHint string) (string, error) {
	if err := a.ensureCalendarProviderConfigured(provider); err != nil {
		return "", err
	}

	values := url.Values{}
	values.Set("state", strings.TrimSpace(stateToken))
	values.Set("redirect_uri", a.calendarCallbackURL())
	values.Set("response_type", "code")
	values.Set("prompt", "consent")
	if strings.TrimSpace(loginHint) != "" {
		values.Set("login_hint", strings.TrimSpace(loginHint))
	}

	switch provider {
	case "google":
		values.Set("client_id", strings.TrimSpace(os.Getenv("GOOGLE_CALENDAR_CLIENT_ID")))
		values.Set("scope", "openid email profile https://www.googleapis.com/auth/calendar")
		values.Set("access_type", "offline")
		values.Set("include_granted_scopes", "true")
		return "https://accounts.google.com/o/oauth2/v2/auth?" + values.Encode(), nil
	case "microsoft":
		values.Set("client_id", strings.TrimSpace(os.Getenv("MICROSOFT_CALENDAR_CLIENT_ID")))
		values.Set("scope", "offline_access openid profile email User.Read Calendars.Read Calendars.ReadWrite")
		return "https://login.microsoftonline.com/common/oauth2/v2.0/authorize?" + values.Encode(), nil
	default:
		return "", errors.New("unsupported calendar provider")
	}
}

func (a *API) calendarCallbackURL() string {
	base := strings.TrimSpace(os.Getenv("PUBLIC_API_URL"))
	if base == "" {
		base = strings.TrimSpace(os.Getenv("API_PUBLIC_URL"))
	}
	if base == "" {
		base = strings.TrimSpace(os.Getenv("APP_API_URL"))
	}
	if base == "" {
		base = "http://localhost:8080"
	}
	return strings.TrimRight(base, "/") + "/admin/calendar/connections/callback"
}

func (a *API) frontendOrigin() string {
	base := strings.TrimSpace(os.Getenv("APP_PUBLIC_URL"))
	if base == "" {
		base = strings.TrimSpace(os.Getenv("FRONTEND_URL"))
	}
	if base == "" {
		base = strings.TrimSpace(os.Getenv("PUBLIC_APP_URL"))
	}
	if base == "" {
		base = "http://localhost:5173"
	}
	return strings.TrimRight(base, "/")
}

func (a *API) renderCalendarCallback(w http.ResponseWriter, ok bool, message string) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	status := "error"
	if ok {
		status = "success"
	}
	escapedOrigin := html.EscapeString(a.frontendOrigin())
	escapedMessage := html.EscapeString(message)
	body := fmt.Sprintf(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Calendar Link</title>
</head>
<body style="font-family: ui-sans-serif, system-ui, sans-serif; padding: 24px; color: #0f172a;">
  <h1 style="font-size: 18px; margin: 0 0 8px;">%s</h1>
  <p style="margin: 0 0 16px;">%s</p>
  <script>
    (function () {
      var payload = { type: "taskflow:calendar-link", status: "%s", message: %q };
      try {
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage(payload, %q);
        }
      } catch (err) {}
      setTimeout(function () { window.close(); }, 200);
    })();
  </script>
</body>
</html>`, escapedMessage, escapedMessage, status, message, escapedOrigin)
	_, _ = w.Write([]byte(body))
}

func (a *API) httpJSON(req *http.Request, target any) error {
	client := &http.Client{Timeout: 15 * time.Second}
	res, err := client.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()

	body, _ := io.ReadAll(io.LimitReader(res.Body, 2<<20))
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		msg := extractRemoteError(body)
		if msg == "" {
			msg = res.Status
		}
		return errors.New(msg)
	}
	if target == nil || len(bytes.TrimSpace(body)) == 0 {
		return nil
	}
	if err := json.Unmarshal(body, target); err != nil {
		return err
	}
	return nil
}

func (a *API) httpJSONOptionalBody(req *http.Request, target any) error {
	client := &http.Client{Timeout: 15 * time.Second}
	res, err := client.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()

	body, _ := io.ReadAll(io.LimitReader(res.Body, 2<<20))
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		msg := extractRemoteError(body)
		if msg == "" {
			msg = res.Status
		}
		return errors.New(msg)
	}
	if len(bytes.TrimSpace(body)) == 0 || target == nil {
		return nil
	}
	return json.Unmarshal(body, target)
}

func (a *API) httpNoContent(req *http.Request) error {
	client := &http.Client{Timeout: 15 * time.Second}
	res, err := client.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()

	if res.StatusCode < 200 || res.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(res.Body, 2<<20))
		msg := extractRemoteError(body)
		if msg == "" {
			msg = res.Status
		}
		return errors.New(msg)
	}
	return nil
}

func (a *API) sealCalendarSecret(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", nil
	}
	key := strings.TrimSpace(os.Getenv("CALENDAR_TOKEN_SECRET"))
	if key == "" {
		return "plain:" + raw, nil
	}

	sum := sha256.Sum256([]byte(key))
	block, err := aes.NewCipher(sum[:])
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return "", err
	}
	ciphertext := gcm.Seal(nil, nonce, []byte(raw), nil)
	return "enc:" + base64.StdEncoding.EncodeToString(append(nonce, ciphertext...)), nil
}

func (a *API) openCalendarSecret(sealed string) (string, error) {
	sealed = strings.TrimSpace(sealed)
	switch {
	case sealed == "":
		return "", nil
	case strings.HasPrefix(sealed, "plain:"):
		return strings.TrimPrefix(sealed, "plain:"), nil
	case strings.HasPrefix(sealed, "enc:"):
		key := strings.TrimSpace(os.Getenv("CALENDAR_TOKEN_SECRET"))
		if key == "" {
			return "", errors.New("calendar token secret missing")
		}
		sum := sha256.Sum256([]byte(key))
		block, err := aes.NewCipher(sum[:])
		if err != nil {
			return "", err
		}
		gcm, err := cipher.NewGCM(block)
		if err != nil {
			return "", err
		}
		raw, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(sealed, "enc:"))
		if err != nil {
			return "", err
		}
		if len(raw) < gcm.NonceSize() {
			return "", errors.New("invalid encrypted calendar token")
		}
		nonce := raw[:gcm.NonceSize()]
		ciphertext := raw[gcm.NonceSize():]
		plain, err := gcm.Open(nil, nonce, ciphertext, nil)
		if err != nil {
			return "", err
		}
		return string(plain), nil
	default:
		return sealed, nil
	}
}

func calendarIDOf(connection models.CalendarConnection) string {
	if strings.TrimSpace(connection.CalendarID) != "" {
		return strings.TrimSpace(connection.CalendarID)
	}
	return "primary"
}

func buildCalendarEventDescription(meeting models.Meeting) string {
	parts := []string{
		"Booked from TaskFlow.",
		"Board: " + strings.TrimSpace(meeting.BoardName),
		"Status: " + strings.TrimSpace(meeting.Status),
	}
	if strings.TrimSpace(meeting.Notes) != "" {
		parts = append(parts, "Agenda: "+strings.TrimSpace(meeting.Notes))
	}
	if strings.TrimSpace(meeting.OutcomeNotes) != "" {
		parts = append(parts, "Outcome notes: "+strings.TrimSpace(meeting.OutcomeNotes))
	}
	return strings.Join(parts, "\n")
}

func extractRemoteError(body []byte) string {
	if len(bytes.TrimSpace(body)) == 0 {
		return ""
	}
	var parsed map[string]any
	if err := json.Unmarshal(body, &parsed); err != nil {
		return strings.TrimSpace(string(body))
	}
	if s := remoteErrorString(parsed["error_description"]); s != "" {
		return s
	}
	if s := remoteErrorString(parsed["error"]); s != "" {
		return s
	}
	if inner, ok := parsed["error"].(map[string]any); ok {
		if s := remoteErrorString(inner["message"]); s != "" {
			return s
		}
	}
	return strings.TrimSpace(string(body))
}

func remoteErrorString(v any) string {
	switch value := v.(type) {
	case string:
		return strings.TrimSpace(value)
	case map[string]any:
		if s, ok := value["message"].(string); ok {
			return strings.TrimSpace(s)
		}
	}
	return ""
}

func parseFlexibleRFC3339(raw string) (time.Time, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return time.Time{}, errors.New("empty time")
	}
	layouts := []string{
		time.RFC3339,
		"2006-01-02T15:04:05",
		"2006-01-02T15:04:05.9999999",
	}
	for _, layout := range layouts {
		if parsed, err := time.Parse(layout, raw); err == nil {
			if layout != time.RFC3339 {
				return parsed.UTC(), nil
			}
			return parsed, nil
		}
	}
	return time.Time{}, errors.New("invalid time")
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func randomHex(size int) (string, error) {
	buf := make([]byte, size)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}
