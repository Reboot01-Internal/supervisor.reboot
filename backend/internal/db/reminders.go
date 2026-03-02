package db

import (
	"database/sql"

	"taskflow/internal/models"
)

func CreateReminder(conn *sql.DB, cardID, userID int64, remindAt string) (int64, error) {
	res, err := conn.Exec(`
		INSERT INTO card_reminders (card_id, user_id, remind_at)
		VALUES (?, ?, ?)
	`, cardID, userID, remindAt)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func DeleteReminder(conn *sql.DB, reminderID int64) error {
	_, err := conn.Exec(`DELETE FROM card_reminders WHERE id = ?`, reminderID)
	return err
}

func ListRemindersByCard(conn *sql.DB, cardID int64) ([]models.CardReminder, error) {
	rows, err := conn.Query(`
		SELECT id, card_id, user_id, remind_at, is_sent, created_at
		FROM card_reminders
		WHERE card_id = ?
		ORDER BY remind_at ASC, id ASC
	`, cardID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []models.CardReminder{}
	for rows.Next() {
		var x models.CardReminder
		var sentInt int
		if err := rows.Scan(&x.ID, &x.CardID, &x.UserID, &x.RemindAt, &sentInt, &x.CreatedAt); err != nil {
			return nil, err
		}
		x.IsSent = sentInt == 1
		out = append(out, x)
	}
	return out, nil
}