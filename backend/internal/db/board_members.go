package db

import (
	"database/sql"

	"taskflow/internal/models"
)

func AddBoardMember(conn *sql.DB, boardID, userID int64, roleInBoard string) error {
	_, err := conn.Exec(`
		INSERT INTO board_members (board_id, user_id, role_in_board)
		VALUES (?, ?, ?)
		ON CONFLICT(board_id, user_id) DO UPDATE SET role_in_board=excluded.role_in_board
	`, boardID, userID, roleInBoard)
	return err
}

func ListBoardMembers(conn *sql.DB, boardID int64) ([]models.BoardMember, error) {
	rows, err := conn.Query(`
		SELECT
			u.id,
			u.full_name,
			u.email,
			u.role,
			IFNULL(u.nickname,''),
			IFNULL(u.cohort,''),
			bm.role_in_board,
			bm.added_at
		FROM board_members bm
		JOIN users u ON u.id = bm.user_id
		WHERE bm.board_id = ?
		ORDER BY u.full_name ASC
	`, boardID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []models.BoardMember{}
	for rows.Next() {
		var m models.BoardMember
		if err := rows.Scan(
			&m.UserID,
			&m.FullName,
			&m.Email,
			&m.Role,
			&m.Nickname,
			&m.Cohort,
			&m.RoleInBoard,
			&m.AddedAt,
		); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, nil
}