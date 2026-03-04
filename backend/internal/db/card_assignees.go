package db

import (
	"database/sql"

	"taskflow/internal/models"
)


func ListAssignees(conn *sql.DB, cardID int64) ([]models.CardAssignee, error) {
	rows, err := conn.Query(`
		SELECT u.id, u.full_name, u.email, u.role
		FROM card_assignments ca
		JOIN users u ON u.id = ca.user_id
		WHERE ca.card_id = ?
		ORDER BY u.full_name ASC
	`, cardID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []models.CardAssignee{}
	for rows.Next() {
		var a models.CardAssignee
		if err := rows.Scan(&a.UserID, &a.FullName, &a.Email, &a.Role); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, nil
}

func AddAssignee(conn *sql.DB, cardID, userID int64) error {
	_, err := conn.Exec(`
		INSERT INTO card_assignments (card_id, user_id)
		VALUES (?, ?)
		ON CONFLICT(card_id, user_id) DO NOTHING
	`, cardID, userID)
	return err
}

func RemoveAssignee(conn *sql.DB, cardID, userID int64) error {
	_, err := conn.Exec(`DELETE FROM card_assignments WHERE card_id = ? AND user_id = ?`, cardID, userID)
	return err
}