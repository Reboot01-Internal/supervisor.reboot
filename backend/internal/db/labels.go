package db

import (
	"database/sql"
	"strings"

	"taskflow/internal/models"
)

func CreateLabel(conn *sql.DB, boardID int64, name, color string) (int64, error) {
	name = strings.TrimSpace(name)
	color = strings.TrimSpace(color)
	if color == "" {
		color = "indigo"
	}

	res, err := conn.Exec(`
		INSERT INTO labels (board_id, name, color)
		VALUES (?, ?, ?)
	`, boardID, name, color)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func ListLabelsByBoard(conn *sql.DB, boardID int64) ([]models.Label, error) {
	rows, err := conn.Query(`
		SELECT id, board_id, name, color, created_at
		FROM labels
		WHERE board_id = ?
		ORDER BY LOWER(name) ASC
	`, boardID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []models.Label{}
	for rows.Next() {
		var l models.Label
		if err := rows.Scan(&l.ID, &l.BoardID, &l.Name, &l.Color, &l.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, l)
	}
	return out, nil
}

func AddLabelToCard(conn *sql.DB, cardID, labelID int64) error {
	_, err := conn.Exec(`
		INSERT INTO card_labels (card_id, label_id)
		VALUES (?, ?)
		ON CONFLICT(card_id, label_id) DO NOTHING
	`, cardID, labelID)
	return err
}

func RemoveLabelFromCard(conn *sql.DB, cardID, labelID int64) error {
	_, err := conn.Exec(`DELETE FROM card_labels WHERE card_id = ? AND label_id = ?`, cardID, labelID)
	return err
}

func ListCardLabels(conn *sql.DB, cardID int64) ([]models.CardLabel, error) {
	rows, err := conn.Query(`
		SELECT l.id, l.name, l.color
		FROM card_labels cl
		JOIN labels l ON l.id = cl.label_id
		WHERE cl.card_id = ?
		ORDER BY LOWER(l.name) ASC
	`, cardID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []models.CardLabel{}
	for rows.Next() {
		var x models.CardLabel
		if err := rows.Scan(&x.LabelID, &x.Name, &x.Color); err != nil {
			return nil, err
		}
		out = append(out, x)
	}
	return out, nil
}