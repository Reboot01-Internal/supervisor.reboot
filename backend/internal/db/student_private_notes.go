package db

import (
	"database/sql"
	"strings"

	"taskflow/internal/models"
)

func CreateStudentPrivateNote(conn *sql.DB, studentID, authorUserID int64, body string) (int64, error) {
	body = strings.TrimSpace(body)
	res, err := conn.Exec(`
		INSERT INTO student_private_notes (student_user_id, author_user_id, body)
		VALUES (?, ?, ?)
	`, studentID, authorUserID, body)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func ListStudentPrivateNotes(conn *sql.DB, studentID int64, limit int) ([]models.StudentPrivateNote, error) {
	if limit <= 0 {
		limit = 100
	}

	rows, err := conn.Query(`
		SELECT
			n.id,
			n.student_user_id,
			n.author_user_id,
			COALESCE(u.full_name, 'Unknown'),
 COALESCE(NULLIF(TRIM(u.nickname), ''), CASE WHEN INSTR(u.email, '@') > 0 THEN SUBSTR(u.email, 1, INSTR(u.email, '@') - 1) ELSE '' END),
			LOWER(TRIM(COALESCE(u.role, ''))),
			n.body,
			n.created_at,
			n.updated_at
		FROM student_private_notes n
		LEFT JOIN users u ON u.id = n.author_user_id
		WHERE n.student_user_id = ?
		ORDER BY n.created_at DESC, n.id DESC
		LIMIT ?
	`, studentID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []models.StudentPrivateNote{}
	for rows.Next() {
		var note models.StudentPrivateNote
		if err := rows.Scan(
			&note.ID,
			&note.StudentID,
			&note.AuthorUserID,
			&note.AuthorName,
			&note.AuthorUsername,
			&note.AuthorRole,
			&note.Body,
			&note.CreatedAt,
			&note.UpdatedAt,
		); err != nil {
			return nil, err
		}
		out = append(out, note)
	}
	return out, rows.Err()
}
