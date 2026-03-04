package db

import "database/sql"

func GetCardIDBySubtaskID(conn *sql.DB, subtaskID int64) (int64, error) {
	var cardID int64
	err := conn.QueryRow(`SELECT card_id FROM card_subtasks WHERE id = ?`, subtaskID).Scan(&cardID)
	return cardID, err
}