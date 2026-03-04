package db

import "database/sql"

func UpdateSubtaskDueDate(conn *sql.DB, subtaskID int64, dueDate string) error {
	_, err := conn.Exec(
		`UPDATE card_subtasks SET due_date = ? WHERE id = ?`,
		dueDate, subtaskID,
	)
	return err
}