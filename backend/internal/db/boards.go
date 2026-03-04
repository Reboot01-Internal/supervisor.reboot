package db

import (
	"database/sql"
	"strings"

	"taskflow/internal/models"
)

func CreateBoard(conn *sql.DB, supervisorFileID int64, name, desc string, createdBy int64) (int64, error) {
	name = strings.TrimSpace(name)
	desc = strings.TrimSpace(desc)

	res, err := conn.Exec(`
		INSERT INTO boards (supervisor_file_id, name, description, created_by)
		VALUES (?, ?, ?, ?)
	`, supervisorFileID, name, desc, createdBy)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func ListBoardsBySupervisorFile(conn *sql.DB, supervisorFileID int64) ([]models.Board, error) {
	rows, err := conn.Query(`
		SELECT id, supervisor_file_id, name, description, created_by, created_at
		FROM boards
		WHERE supervisor_file_id = ?
		ORDER BY created_at DESC
	`, supervisorFileID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []models.Board{}
	for rows.Next() {
		var b models.Board
		if err := rows.Scan(&b.ID, &b.SupervisorFileID, &b.Name, &b.Description, &b.CreatedBy, &b.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, b)
	}
	return out, nil
}

// Board data
func GetBoardBasic(conn *sql.DB, boardID int64) (models.Board, error) {
	var b models.Board
	err := conn.QueryRow(`
		SELECT id, supervisor_file_id, name, description, created_by, created_at
		FROM boards WHERE id = ?
	`, boardID).Scan(&b.ID, &b.SupervisorFileID, &b.Name, &b.Description, &b.CreatedBy, &b.CreatedAt)
	return b, err
}