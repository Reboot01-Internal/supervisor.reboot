package db

import (
	"database/sql"

	"taskflow/internal/models"
)

func InsertCardActivity(conn *sql.DB, cardID int64, actorUserID int64, action string, meta string) error {
	var actor any = nil
	if actorUserID > 0 {
		actor = actorUserID
	}

	_, err := conn.Exec(`
		INSERT INTO card_activity (card_id, actor_user_id, action, meta)
		VALUES (?, ?, ?, ?)
	`, cardID, actor, action, meta)
	return err
}

func ListCardActivity(conn *sql.DB, cardID int64, limit int) ([]models.CardActivity, error) {
	if limit <= 0 {
		limit = 40
	}

	rows, err := conn.Query(`
		SELECT
			a.id,
			a.card_id,
			COALESCE(a.actor_user_id, 0) as actor_user_id,
			COALESCE(u.full_name, 'System') as actor_name,
			a.action,
			COALESCE(a.meta, '') as meta,
			a.created_at
		FROM card_activity a
		LEFT JOIN users u ON u.id = a.actor_user_id
		WHERE a.card_id = ?
		ORDER BY a.created_at DESC, a.id DESC
		LIMIT ?
	`, cardID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]models.CardActivity, 0, limit)
	for rows.Next() {
		var a models.CardActivity
		if err := rows.Scan(
			&a.ID,
			&a.CardID,
			&a.ActorUserID,
			&a.ActorName,
			&a.Action,
			&a.Meta,
			&a.CreatedAt,
		); err != nil {
			return nil, err
		}
		out = append(out, a)
	}

	return out, nil
}