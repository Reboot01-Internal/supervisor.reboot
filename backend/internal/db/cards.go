package db

import (
	"database/sql"
	"strings"

	"taskflow/internal/models"
)

// Cards
func CreateCard(conn *sql.DB, listID int64, title, description string) (int64, error) {
	title = strings.TrimSpace(title)
	description = strings.TrimSpace(description)

	var nextPos int64
	_ = conn.QueryRow(`SELECT COALESCE(MAX(position), -1) + 1 FROM cards WHERE list_id = ?`, listID).Scan(&nextPos)

	res, err := conn.Exec(`
		INSERT INTO cards (list_id, title, description, position)
		VALUES (?, ?, ?, ?)
	`, listID, title, description, nextPos)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func ListCardsByBoard(conn *sql.DB, boardID int64) ([]models.Card, error) {
	rows, err := conn.Query(`
		SELECT
			c.id,
			c.list_id,
			c.title,
			c.description,
			c.position,
			c.created_at,
			COALESCE(c.due_date, ''),
			COALESCE(c.status, 'todo'),
			COALESCE(c.priority, 'medium')
		FROM cards c
		JOIN lists l ON l.id = c.list_id
		WHERE l.board_id = ?
		ORDER BY l.position ASC, c.position ASC
	`, boardID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []models.Card{}
	for rows.Next() {
		var c models.Card
		if err := rows.Scan(
			&c.ID,
			&c.ListID,
			&c.Title,
			&c.Description,
			&c.Position,
			&c.CreatedAt,
			&c.DueDate,
			&c.Status,
			&c.Priority,
		); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, nil
}

// Move card between lists + update ordering (simple + robust)
func MoveCard(conn *sql.DB, cardID, toListID int64, toPosition int64) error {
	// shift down existing cards in target list from toPosition
	_, err := conn.Exec(`
		UPDATE cards
		SET position = position + 1
		WHERE list_id = ? AND position >= ?
	`, toListID, toPosition)
	if err != nil {
		return err
	}

	// move the card
	_, err = conn.Exec(`
		UPDATE cards
		SET list_id = ?, position = ?
		WHERE id = ?
	`, toListID, toPosition, cardID)
	return err
}

// reorder within a list (array of card IDs in correct order)
func ReorderCards(conn *sql.DB, listID int64, orderedIDs []int64) error {
	tx, err := conn.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	for i, id := range orderedIDs {
		_, err := tx.Exec(`UPDATE cards SET position = ? WHERE id = ? AND list_id = ?`, i, id, listID)
		if err != nil {
			return err
		}
	}

	return tx.Commit()
}

func GetCard(conn *sql.DB, cardID int64) (models.Card, error) {
	var c models.Card
	err := conn.QueryRow(`
		SELECT id, list_id, title, description, position, created_at
		FROM cards
		WHERE id = ?
	`, cardID).Scan(&c.ID, &c.ListID, &c.Title, &c.Description, &c.Position, &c.CreatedAt)
	return c, err
}

func UpdateCard(conn *sql.DB, cardID int64, title, description string) error {
	title = strings.TrimSpace(title)
	description = strings.TrimSpace(description)

	_, err := conn.Exec(`
		UPDATE cards
		SET title = ?, description = ?
		WHERE id = ?
	`, title, description, cardID)
	return err
}