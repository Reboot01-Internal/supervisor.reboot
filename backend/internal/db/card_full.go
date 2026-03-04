package db

import (
	"database/sql"
	"strings"

	"taskflow/internal/models"
)


func GetBoardIDByCardID(conn *sql.DB, cardID int64) (int64, error) {
	var boardID int64
	err := conn.QueryRow(`
		SELECT l.board_id
		FROM cards c
		JOIN lists l ON l.id = c.list_id
		WHERE c.id = ?
	`, cardID).Scan(&boardID)
	return boardID, err
}

func GetCardWithDue(conn *sql.DB, cardID int64) (models.Card, error) {
	var c models.Card
	var due sql.NullString
	var status sql.NullString
	var priority sql.NullString

	err := conn.QueryRow(`
		SELECT id, list_id, title, description, due_date, COALESCE(status,'todo'), COALESCE(priority,'medium'), position, created_at
		FROM cards
		WHERE id = ?
	`, cardID).Scan(&c.ID, &c.ListID, &c.Title, &c.Description, &due, &status, &priority, &c.Position, &c.CreatedAt)

	if err != nil {
		return c, err
	}

	if due.Valid {
		c.DueDate = due.String
	} else {
		c.DueDate = ""
	}
	if status.Valid && status.String != "" {
		c.Status = status.String
	} else {
		c.Status = "todo"
	}
	if priority.Valid && priority.String != "" {
		c.Priority = priority.String
	} else {
		c.Priority = "medium"
	}

	return c, nil
}

func UpdateCardAll(conn *sql.DB, cardID int64, title, description, dueDate, status, priority string) error {
	title = strings.TrimSpace(title)
	description = strings.TrimSpace(description)

	var due any = nil
	if strings.TrimSpace(dueDate) != "" {
		due = strings.TrimSpace(dueDate)
	}

	if strings.TrimSpace(status) == "" {
		status = "todo"
	}
	if strings.TrimSpace(priority) == "" {
		priority = "medium"
	}

	_, err := conn.Exec(`
		UPDATE cards
		SET title = ?, description = ?, due_date = ?, status = ?, priority = ?
		WHERE id = ?
	`, title, description, due, status, priority, cardID)
	return err
}