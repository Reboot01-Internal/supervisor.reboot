package db

import (
	"database/sql"
	"fmt"
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
		SELECT id, supervisor_file_id, name, description, IFNULL(status, 'active'), IFNULL(inactive_at, ''), created_by, created_at
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
		if err := rows.Scan(&b.ID, &b.SupervisorFileID, &b.Name, &b.Description, &b.Status, &b.InactiveAt, &b.CreatedBy, &b.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, b)
	}
	return out, nil
}

func ListAllBoardIDs(conn *sql.DB) ([]int64, error) {
	rows, err := conn.Query(`
		SELECT id
		FROM boards
		ORDER BY created_at ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []int64{}
	for rows.Next() {
		var boardID int64
		if err := rows.Scan(&boardID); err != nil {
			return nil, err
		}
		out = append(out, boardID)
	}
	return out, rows.Err()
}

// Board data
func GetBoardBasic(conn *sql.DB, boardID int64) (models.Board, error) {
	var b models.Board
	err := conn.QueryRow(`
		SELECT id, supervisor_file_id, name, description, IFNULL(status, 'active'), IFNULL(inactive_at, ''), created_by, created_at
		FROM boards WHERE id = ?
	`, boardID).Scan(&b.ID, &b.SupervisorFileID, &b.Name, &b.Description, &b.Status, &b.InactiveAt, &b.CreatedBy, &b.CreatedAt)
	return b, err
}

func GetBoardDiscordInfo(conn *sql.DB, boardID int64) (models.BoardDiscordInfo, error) {
	var b models.BoardDiscordInfo
	err := conn.QueryRow(`
		SELECT
			b.id,
			b.supervisor_file_id,
			b.name,
			b.description,
			IFNULL(b.status, 'active'),
			IFNULL(b.inactive_at, ''),
			b.created_by,
			b.created_at,
			IFNULL(u.full_name, ''),
			IFNULL(u.nickname, '')
		FROM boards b
		JOIN supervisor_files sf ON sf.id = b.supervisor_file_id
		LEFT JOIN users u ON u.id = sf.supervisor_user_id
		WHERE b.id = ?
	`, boardID).Scan(
		&b.ID,
		&b.SupervisorFileID,
		&b.Name,
		&b.Description,
		&b.Status,
		&b.InactiveAt,
		&b.CreatedBy,
		&b.CreatedAt,
		&b.SupervisorFullName,
		&b.SupervisorNickname,
	)
	return b, err
}

func UpdateBoardName(conn *sql.DB, boardID int64, name string) error {
	name = strings.TrimSpace(name)
	_, err := conn.Exec(`
		UPDATE boards
		SET name = ?
		WHERE id = ?
	`, name, boardID)
	return err
}

func UpdateBoardStatus(conn *sql.DB, boardID int64, status string) error {
	status = strings.TrimSpace(strings.ToLower(status))
	_, err := conn.Exec(`
		UPDATE boards
		SET status = ?,
		    inactive_at = CASE WHEN ? = 'inactive' THEN datetime('now') ELSE '' END
		WHERE id = ?
	`, status, status, boardID)
	return err
}

func DeleteBoard(conn *sql.DB, boardID int64) error {
	_, err := conn.Exec(`DELETE FROM boards WHERE id = ?`, boardID)
	return err
}

func ReassignBoardSupervisor(conn *sql.DB, boardID, nextSupervisorUserID int64) error {
	tx, err := conn.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	var currentSupervisorUserID int64
	var currentBoardName string
	var currentSupervisorNickname string
	err = tx.QueryRow(`
		SELECT sf.supervisor_user_id, b.name, IFNULL(u.nickname, '')
		FROM boards b
		JOIN supervisor_files sf ON sf.id = b.supervisor_file_id
		LEFT JOIN users u ON u.id = sf.supervisor_user_id
		WHERE b.id = ?
	`, boardID).Scan(&currentSupervisorUserID, &currentBoardName, &currentSupervisorNickname)
	if err != nil {
		return err
	}

	var nextSupervisorFileID int64
	var nextSupervisorNickname string
	err = tx.QueryRow(`
		SELECT sf.id, IFNULL(u.nickname, '')
		FROM supervisor_files sf
		JOIN users u ON u.id = sf.supervisor_user_id
		WHERE sf.supervisor_user_id = ?
		LIMIT 1
	`, nextSupervisorUserID).Scan(&nextSupervisorFileID, &nextSupervisorNickname)
	if err != nil {
		return err
	}

	if currentSupervisorUserID == nextSupervisorUserID {
		return nil
	}

	currentSupervisorNickname = strings.TrimSpace(strings.TrimPrefix(currentSupervisorNickname, "@"))
	nextSupervisorNickname = strings.TrimSpace(strings.TrimPrefix(nextSupervisorNickname, "@"))
	currentBoardName = strings.TrimSpace(currentBoardName)

	nextBoardName := currentBoardName
	if nextSupervisorNickname != "" {
		switch {
		case currentSupervisorNickname != "" && (currentBoardName == currentSupervisorNickname+"-" || strings.HasPrefix(currentBoardName, currentSupervisorNickname+"-")):
			nextBoardName = nextSupervisorNickname + "-" + strings.TrimPrefix(currentBoardName, currentSupervisorNickname+"-")
		case !strings.HasPrefix(currentBoardName, nextSupervisorNickname+"-"):
			nextBoardName = nextSupervisorNickname + "-" + currentBoardName
		}
	}

	res, err := tx.Exec(`
		UPDATE boards
		SET supervisor_file_id = ?, name = ?
		WHERE id = ?
	`, nextSupervisorFileID, nextBoardName, boardID)
	if err != nil {
		return err
	}
	affected, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if affected == 0 {
		return fmt.Errorf("board not found")
	}

	if _, err := tx.Exec(`
		INSERT INTO board_members (board_id, user_id, role_in_board)
		VALUES (?, ?, ?)
		ON CONFLICT(board_id, user_id) DO UPDATE SET role_in_board = excluded.role_in_board
	`, boardID, nextSupervisorUserID, "owner"); err != nil {
		return err
	}

	if _, err := tx.Exec(`
		DELETE FROM board_members
		WHERE board_id = ? AND user_id = ?
	`, boardID, currentSupervisorUserID); err != nil {
		return err
	}

	return tx.Commit()
}
