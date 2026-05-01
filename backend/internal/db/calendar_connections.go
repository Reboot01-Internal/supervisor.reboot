package db

import (
	"database/sql"
	"strings"

	"taskflow/internal/models"
)

func UpsertCalendarConnection(
	conn *sql.DB,
	userID int64,
	provider, externalEmail, calendarID, calendarName, accessToken, refreshToken, tokenType, scope, tokenExpiresAt, status, lastError string,
) (int64, error) {
	provider = strings.ToLower(strings.TrimSpace(provider))
	externalEmail = strings.TrimSpace(externalEmail)
	calendarID = strings.TrimSpace(calendarID)
	calendarName = strings.TrimSpace(calendarName)
	accessToken = strings.TrimSpace(accessToken)
	refreshToken = strings.TrimSpace(refreshToken)
	tokenType = strings.TrimSpace(tokenType)
	scope = strings.TrimSpace(scope)
	tokenExpiresAt = strings.TrimSpace(tokenExpiresAt)
	status = strings.TrimSpace(status)
	lastError = strings.TrimSpace(lastError)

	if status == "" {
		status = "connected"
	}
	if calendarID == "" {
		calendarID = "primary"
	}
	if calendarName == "" {
		calendarName = "Primary calendar"
	}

	res, err := conn.Exec(`
		INSERT INTO calendar_connections (
			user_id, provider, external_email, calendar_id, calendar_name,
			access_token, refresh_token, token_type, token_scope, token_expires_at,
			status, last_error, last_synced_at, last_conflict_at
		)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)
		ON CONFLICT(user_id, provider) DO UPDATE SET
			external_email = excluded.external_email,
			calendar_id = excluded.calendar_id,
			calendar_name = excluded.calendar_name,
			access_token = excluded.access_token,
			refresh_token = CASE
				WHEN excluded.refresh_token <> '' THEN excluded.refresh_token
				ELSE calendar_connections.refresh_token
			END,
			token_type = excluded.token_type,
			token_scope = excluded.token_scope,
			token_expires_at = excluded.token_expires_at,
			status = excluded.status,
			last_error = excluded.last_error,
			updated_at = datetime('now')
	`, userID, provider, externalEmail, calendarID, calendarName, accessToken, refreshToken, tokenType, scope, tokenExpiresAt, status, lastError)
	if err != nil {
		return 0, err
	}

	if id, err := res.LastInsertId(); err == nil && id > 0 {
		return id, nil
	}

	var id int64
	err = conn.QueryRow(`
		SELECT id
		FROM calendar_connections
		WHERE user_id = ? AND provider = ?
	`, userID, provider).Scan(&id)
	return id, err
}

func ListCalendarConnectionsByUser(conn *sql.DB, userID int64) ([]models.CalendarConnection, error) {
	rows, err := conn.Query(`
		SELECT
			id,
			user_id,
			provider,
			external_email,
			calendar_id,
			calendar_name,
			status,
			IFNULL(last_synced_at, ''),
			IFNULL(last_conflict_at, ''),
			IFNULL(last_error, ''),
			created_at,
			updated_at
		FROM calendar_connections
		WHERE user_id = ?
		ORDER BY provider ASC, id ASC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []models.CalendarConnection{}
	for rows.Next() {
		var item models.CalendarConnection
		if err := rows.Scan(
			&item.ID,
			&item.UserID,
			&item.Provider,
			&item.ExternalEmail,
			&item.CalendarID,
			&item.CalendarName,
			&item.Status,
			&item.LastSyncedAt,
			&item.LastConflictAt,
			&item.LastError,
			&item.CreatedAt,
			&item.UpdatedAt,
		); err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

func GetCalendarConnectionByUserAndProvider(conn *sql.DB, userID int64, provider string) (models.CalendarConnection, error) {
	var item models.CalendarConnection
	err := conn.QueryRow(`
		SELECT
			id,
			user_id,
			provider,
			external_email,
			calendar_id,
			calendar_name,
			status,
			IFNULL(last_synced_at, ''),
			IFNULL(last_conflict_at, ''),
			IFNULL(last_error, ''),
			created_at,
			updated_at
		FROM calendar_connections
		WHERE user_id = ? AND provider = ?
	`, userID, strings.ToLower(strings.TrimSpace(provider))).Scan(
		&item.ID,
		&item.UserID,
		&item.Provider,
		&item.ExternalEmail,
		&item.CalendarID,
		&item.CalendarName,
		&item.Status,
		&item.LastSyncedAt,
		&item.LastConflictAt,
		&item.LastError,
		&item.CreatedAt,
		&item.UpdatedAt,
	)
	return item, err
}

func GetCalendarConnectionSecrets(conn *sql.DB, connectionID int64) (accessToken, refreshToken, tokenType, scope, tokenExpiresAt string, err error) {
	err = conn.QueryRow(`
		SELECT
			IFNULL(access_token, ''),
			IFNULL(refresh_token, ''),
			IFNULL(token_type, ''),
			IFNULL(token_scope, ''),
			IFNULL(token_expires_at, '')
		FROM calendar_connections
		WHERE id = ?
	`, connectionID).Scan(&accessToken, &refreshToken, &tokenType, &scope, &tokenExpiresAt)
	return
}

func DeleteCalendarConnection(conn *sql.DB, userID int64, provider string) error {
	_, err := conn.Exec(`
		DELETE FROM calendar_connections
		WHERE user_id = ? AND provider = ?
	`, userID, strings.ToLower(strings.TrimSpace(provider)))
	return err
}

func UpdateCalendarConnectionTokens(conn *sql.DB, connectionID int64, accessToken, refreshToken, tokenType, scope, tokenExpiresAt, status, lastError string) error {
	_, err := conn.Exec(`
		UPDATE calendar_connections
		SET access_token = ?,
		    refresh_token = CASE WHEN ? <> '' THEN ? ELSE refresh_token END,
		    token_type = ?,
		    token_scope = ?,
		    token_expires_at = ?,
		    status = ?,
		    last_error = ?,
		    updated_at = datetime('now')
		WHERE id = ?
	`, strings.TrimSpace(accessToken), strings.TrimSpace(refreshToken), strings.TrimSpace(refreshToken), strings.TrimSpace(tokenType), strings.TrimSpace(scope), strings.TrimSpace(tokenExpiresAt), strings.TrimSpace(status), strings.TrimSpace(lastError), connectionID)
	return err
}

func MarkCalendarConnectionConflict(conn *sql.DB, connectionID int64, lastError string) error {
	_, err := conn.Exec(`
		UPDATE calendar_connections
		SET last_conflict_at = datetime('now'),
		    last_error = ?,
		    updated_at = datetime('now')
		WHERE id = ?
	`, strings.TrimSpace(lastError), connectionID)
	return err
}

func MarkCalendarConnectionSynced(conn *sql.DB, connectionID int64) error {
	_, err := conn.Exec(`
		UPDATE calendar_connections
		SET status = 'connected',
		    last_error = '',
		    last_synced_at = datetime('now'),
		    updated_at = datetime('now')
		WHERE id = ?
	`, connectionID)
	return err
}

func CreateCalendarOAuthState(conn *sql.DB, stateToken string, userID int64, provider, loginHint string) error {
	_, err := conn.Exec(`
		INSERT INTO calendar_oauth_states (state_token, user_id, provider, login_hint)
		VALUES (?, ?, ?, ?)
	`, strings.TrimSpace(stateToken), userID, strings.ToLower(strings.TrimSpace(provider)), strings.TrimSpace(loginHint))
	return err
}

func ConsumeCalendarOAuthState(conn *sql.DB, stateToken string) (userID int64, provider, loginHint string, err error) {
	tx, err := conn.Begin()
	if err != nil {
		return 0, "", "", err
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()

	err = tx.QueryRow(`
		SELECT user_id, provider, IFNULL(login_hint, '')
		FROM calendar_oauth_states
		WHERE state_token = ?
	`, strings.TrimSpace(stateToken)).Scan(&userID, &provider, &loginHint)
	if err != nil {
		return 0, "", "", err
	}
	if _, err = tx.Exec(`DELETE FROM calendar_oauth_states WHERE state_token = ?`, strings.TrimSpace(stateToken)); err != nil {
		return 0, "", "", err
	}
	err = tx.Commit()
	return
}

func UpsertMeetingCalendarEvent(conn *sql.DB, meetingID, connectionID int64, provider, externalCalendarID, externalEventID, syncStatus, syncError string) error {
	_, err := conn.Exec(`
		INSERT INTO meeting_calendar_events (
			meeting_id, connection_id, provider, external_calendar_id, external_event_id,
			last_synced_at, last_sync_status, last_sync_error
		)
		VALUES (?, ?, ?, ?, ?, datetime('now'), ?, ?)
		ON CONFLICT(meeting_id, provider) DO UPDATE SET
			connection_id = excluded.connection_id,
			external_calendar_id = excluded.external_calendar_id,
			external_event_id = excluded.external_event_id,
			last_synced_at = datetime('now'),
			last_sync_status = excluded.last_sync_status,
			last_sync_error = excluded.last_sync_error
	`, meetingID, connectionID, strings.ToLower(strings.TrimSpace(provider)), strings.TrimSpace(externalCalendarID), strings.TrimSpace(externalEventID), strings.TrimSpace(syncStatus), strings.TrimSpace(syncError))
	return err
}

func GetMeetingCalendarEvent(conn *sql.DB, meetingID int64, provider string) (models.MeetingCalendarEvent, error) {
	var item models.MeetingCalendarEvent
	err := conn.QueryRow(`
		SELECT
			meeting_id,
			connection_id,
			provider,
			IFNULL(external_calendar_id, ''),
			IFNULL(external_event_id, ''),
			IFNULL(last_synced_at, ''),
			IFNULL(last_sync_status, ''),
			IFNULL(last_sync_error, '')
		FROM meeting_calendar_events
		WHERE meeting_id = ? AND provider = ?
	`, meetingID, strings.ToLower(strings.TrimSpace(provider))).Scan(
		&item.MeetingID,
		&item.ConnectionID,
		&item.Provider,
		&item.ExternalCalendarID,
		&item.ExternalEventID,
		&item.LastSyncedAt,
		&item.LastSyncStatus,
		&item.LastSyncError,
	)
	return item, err
}

func DeleteMeetingCalendarEvents(conn *sql.DB, meetingID int64) error {
	_, err := conn.Exec(`DELETE FROM meeting_calendar_events WHERE meeting_id = ?`, meetingID)
	return err
}
