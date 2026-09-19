package db

import (
	"database/sql"
	"strings"

	"taskflow/internal/models"
)

// Lists
func CreateList(conn *sql.DB, boardID int64, title string) (int64, error) {
	title = strings.TrimSpace(title)

	var nextPos int64
	_ = conn.QueryRow(`SELECT COALESCE(MAX(position), -1) + 1 FROM lists WHERE board_id = ?`, boardID).Scan(&nextPos)

	res, err := conn.Exec(`
		INSERT INTO lists (board_id, title, position)
		VALUES (?, ?, ?)
	`, boardID, title, nextPos)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func ListLists(conn *sql.DB, boardID int64) ([]models.List, error) {
	rows, err := conn.Query(`
		SELECT l.id, l.board_id, l.title, l.position, l.created_at, COALESCE(lc.color,'')
		FROM lists l LEFT JOIN list_colors lc ON lc.list_id = l.id
		WHERE board_id = ?
		ORDER BY position ASC
	`, boardID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []models.List{}
	for rows.Next() {
		var l models.List
		if err := rows.Scan(&l.ID, &l.BoardID, &l.Title, &l.Position, &l.CreatedAt, &l.Color); err != nil {
			return nil, err
		}
		out = append(out, l)
	}
	return out, nil
}

func GetBoardIDByListID(conn *sql.DB, listID int64) (int64, error) {
	var boardID int64
	err := conn.QueryRow(`SELECT board_id FROM lists WHERE id = ?`, listID).Scan(&boardID)
	return boardID, err
}

func DeleteList(conn *sql.DB, listID int64) error {
	_, err := conn.Exec(`DELETE FROM lists WHERE id = ?`, listID)
	return err
}

func UpdateListTitle(conn *sql.DB, listID int64, title string) error {
	title = strings.TrimSpace(title)
	_, err := conn.Exec(`UPDATE lists SET title = ? WHERE id = ?`, title, listID)
	return err
}

func UpdateListAppearance(conn *sql.DB, listID int64, title string, color *string) error {
	tx, err := conn.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if title != "" {
		if _, err = tx.Exec("UPDATE lists SET title = ? WHERE id = ?", title, listID); err != nil {
			return err
		}
	}
	if color != nil {
		if _, err = tx.Exec("INSERT INTO list_colors(list_id, color) VALUES (?, ?) ON CONFLICT(list_id) DO UPDATE SET color=excluded.color", listID, *color); err != nil {
			return err
		}
	}
	return tx.Commit()
}
