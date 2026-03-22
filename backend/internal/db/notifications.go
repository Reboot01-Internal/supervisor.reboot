package db

import (
	"database/sql"
	"strings"

	"taskflow/internal/models"
)

func CreateNotification(conn DBTX, userID int64, kind, title, body, link string) error {
	_, err := conn.Exec(`
		INSERT INTO app_notifications (user_id, kind, title, body, link)
		VALUES (?, ?, ?, ?, ?)
	`, userID, strings.TrimSpace(kind), strings.TrimSpace(title), strings.TrimSpace(body), strings.TrimSpace(link))
	return err
}

func ListNotificationsByUser(conn DBTX, userID int64) ([]models.AppNotification, error) {
	rows, err := conn.Query(`
		SELECT id, user_id, kind, title, body, link, is_read, created_at
		FROM app_notifications
		WHERE user_id = ?
		ORDER BY datetime(created_at) DESC, id DESC
		LIMIT 100
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []models.AppNotification{}
	for rows.Next() {
		var item models.AppNotification
		var readInt int
		if err := rows.Scan(&item.ID, &item.UserID, &item.Kind, &item.Title, &item.Body, &item.Link, &readInt, &item.CreatedAt); err != nil {
			return nil, err
		}
		item.IsRead = readInt == 1
		out = append(out, item)
	}
	return out, rows.Err()
}

func MarkNotificationRead(conn DBTX, userID, notificationID int64) error {
	_, err := conn.Exec(`
		UPDATE app_notifications
		SET is_read = 1
		WHERE id = ? AND user_id = ?
	`, notificationID, userID)
	return err
}

func MarkAllNotificationsRead(conn DBTX, userID int64) error {
	_, err := conn.Exec(`
		UPDATE app_notifications
		SET is_read = 1
		WHERE user_id = ? AND is_read = 0
	`, userID)
	return err
}

func HasMeetingReminderEvent(conn DBTX, meetingID, userID int64, reminderType, meetingStart string) (bool, error) {
	var exists int
	err := conn.QueryRow(`
		SELECT 1
		FROM meeting_reminder_events
		WHERE meeting_id = ? AND user_id = ? AND reminder_type = ? AND meeting_start = ?
		LIMIT 1
	`, meetingID, userID, strings.TrimSpace(reminderType), strings.TrimSpace(meetingStart)).Scan(&exists)
	if err == sql.ErrNoRows {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return true, nil
}

func MarkMeetingReminderEvent(conn DBTX, meetingID, userID int64, reminderType, meetingStart string) error {
	_, err := conn.Exec(`
		INSERT INTO meeting_reminder_events (meeting_id, user_id, reminder_type, meeting_start)
		VALUES (?, ?, ?, ?)
		ON CONFLICT(meeting_id, user_id, reminder_type, meeting_start) DO NOTHING
	`, meetingID, userID, strings.TrimSpace(reminderType), strings.TrimSpace(meetingStart))
	return err
}
