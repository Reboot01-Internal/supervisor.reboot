package db

import (
	"database/sql"

	"taskflow/internal/models"
)


func CreateSubtask(conn *sql.DB, cardID int64, title string, dueDate string) (int64, error) {
	res, err := conn.Exec(
		`INSERT INTO card_subtasks (card_id, title, is_done, due_date) VALUES (?, ?, 0, ?)`,
		cardID, title, dueDate,
	)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func ListSubtasks(conn *sql.DB, cardID int64) ([]models.CardSubtask, error) {
	rows, err := conn.Query(`
		SELECT id, card_id, title, is_done, COALESCE(due_date,''), position, created_at
		FROM card_subtasks
		WHERE card_id = ?
		ORDER BY position ASC
	`, cardID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []models.CardSubtask{}
	for rows.Next() {
		var s models.CardSubtask
		var doneInt int
		if err := rows.Scan(&s.ID, &s.CardID, &s.Title, &doneInt, &s.DueDate, &s.Position, &s.CreatedAt); err != nil {
			return nil, err
		}
		s.IsDone = doneInt == 1
		out = append(out, s)
	}
	return out, nil
}

func ToggleSubtaskDone(conn *sql.DB, subtaskID int64, isDone bool) error {
	doneInt := 0
	if isDone {
		doneInt = 1
	}
	_, err := conn.Exec(`UPDATE card_subtasks SET is_done = ? WHERE id = ?`, doneInt, subtaskID)
	return err
}

func DeleteSubtask(conn *sql.DB, subtaskID int64) error {
	_, err := conn.Exec(`DELETE FROM card_subtasks WHERE id = ?`, subtaskID)
	return err
}