package db

import "database/sql"

// func CreateSubtask(conn *sql.DB, cardID int64, title string, dueDate string) (int64, error) {
// 	res, err := conn.Exec(
// 		`INSERT INTO card_subtasks (card_id, title, is_done, due_date) VALUES (?, ?, 0, ?)`,
// 		cardID, title, dueDate,
// 	)
// 	if err != nil {
// 		return 0, err
// 	}
// 	return res.LastInsertId()
// }

func UpdateSubtaskDueDate(conn *sql.DB, subtaskID int64, dueDate string) error {
	_, err := conn.Exec(
		`UPDATE card_subtasks SET due_date = ? WHERE id = ?`,
		dueDate, subtaskID,
	)
	return err
}