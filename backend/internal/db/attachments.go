package db

import (
	"database/sql"

	"taskflow/internal/models"
)

func InsertAttachment(conn *sql.DB, cardID, uploaderUserID int64, originalName, storedName, mime string, sizeBytes int64) (int64, error) {
	var uploader any = nil
	if uploaderUserID > 0 {
		uploader = uploaderUserID
	}

	res, err := conn.Exec(`
		INSERT INTO card_attachments (card_id, uploader_user_id, original_name, stored_name, mime_type, size_bytes)
		VALUES (?, ?, ?, ?, ?, ?)
	`, cardID, uploader, originalName, storedName, mime, sizeBytes)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func DeleteAttachment(conn *sql.DB, attachmentID int64) error {
	_, err := conn.Exec(`DELETE FROM card_attachments WHERE id = ?`, attachmentID)
	return err
}

func GetAttachment(conn *sql.DB, attachmentID int64) (models.CardAttachment, error) {
	var a models.CardAttachment
	err := conn.QueryRow(`
		SELECT
			x.id,
			x.card_id,
			COALESCE(x.uploader_user_id, 0) as uploader_user_id,
			COALESCE(u.full_name, 'System') as uploader_name,
			x.original_name,
			x.stored_name,
			x.mime_type,
			x.size_bytes,
			x.created_at
		FROM card_attachments x
		LEFT JOIN users u ON u.id = x.uploader_user_id
		WHERE x.id = ?
	`, attachmentID).Scan(
		&a.ID, &a.CardID, &a.UploaderUserID, &a.UploaderName,
		&a.OriginalName, &a.StoredName, &a.MimeType, &a.SizeBytes, &a.CreatedAt,
	)
	return a, err
}

func ListAttachments(conn *sql.DB, cardID int64, limit int) ([]models.CardAttachment, error) {
	if limit <= 0 {
		limit = 50
	}

	rows, err := conn.Query(`
		SELECT
			x.id,
			x.card_id,
			COALESCE(x.uploader_user_id, 0) as uploader_user_id,
			COALESCE(u.full_name, 'System') as uploader_name,
			x.original_name,
			x.stored_name,
			x.mime_type,
			x.size_bytes,
			x.created_at
		FROM card_attachments x
		LEFT JOIN users u ON u.id = x.uploader_user_id
		WHERE x.card_id = ?
		ORDER BY x.created_at DESC, x.id DESC
		LIMIT ?
	`, cardID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []models.CardAttachment{}
	for rows.Next() {
		var a models.CardAttachment
		if err := rows.Scan(
			&a.ID, &a.CardID, &a.UploaderUserID, &a.UploaderName,
			&a.OriginalName, &a.StoredName, &a.MimeType, &a.SizeBytes, &a.CreatedAt,
		); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, nil
}