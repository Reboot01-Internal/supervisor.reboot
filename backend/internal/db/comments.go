package db

import (
	"database/sql"
	"strings"

	"taskflow/internal/models"
)

func CreateCardComment(conn *sql.DB, cardID, actorUserID int64, body string) (int64, error) {
	body = strings.TrimSpace(body)
	res, err := conn.Exec(`
		INSERT INTO card_comments (card_id, actor_user_id, body)
		VALUES (?, ?, ?)
	`, cardID, actorUserID, body)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func UpdateCardComment(conn *sql.DB, commentID int64, body string) error {
	body = strings.TrimSpace(body)
	_, err := conn.Exec(`
		UPDATE card_comments
		SET body = ?, updated_at = datetime('now')
		WHERE id = ?
	`, body, commentID)
	return err
}

func DeleteCardComment(conn *sql.DB, commentID int64) error {
	_, err := conn.Exec(`DELETE FROM card_comments WHERE id = ?`, commentID)
	return err
}

func ListCardComments(conn *sql.DB, cardID int64, limit int) ([]models.CardComment, error) {
	if limit <= 0 {
		limit = 60
	}

	rows, err := conn.Query(`
		SELECT
			c.id,
			c.card_id,
			COALESCE(c.actor_user_id, 0) as actor_user_id,
			COALESCE(u.full_name, 'System') as actor_name,
			c.body,
			c.created_at,
			c.updated_at
		FROM card_comments c
		LEFT JOIN users u ON u.id = c.actor_user_id
		WHERE c.card_id = ?
		ORDER BY c.created_at DESC, c.id DESC
		LIMIT ?
	`, cardID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []models.CardComment{}
	for rows.Next() {
		var x models.CardComment
		if err := rows.Scan(&x.ID, &x.CardID, &x.ActorUserID, &x.ActorName, &x.Body, &x.CreatedAt, &x.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, x)
	}
	return out, nil
}
