package db

import (
	"database/sql"
	"strings"

	"taskflow/internal/models"
)

func IsStudentAssignedToSupervisor(conn *sql.DB, supervisorID, studentID int64) (bool, error) {
	var count int
	err := conn.QueryRow(`
		SELECT COUNT(*)
		FROM supervisor_students
		WHERE supervisor_user_id = ? AND student_user_id = ?
	`, supervisorID, studentID).Scan(&count)
	return count > 0, err
}

func ListEligibleStudentsForSupervisor(conn DBTX, supervisorUserID int64, q string) ([]models.User, error) {
	q = strings.TrimSpace(q)

	rows, err := conn.Query(`
		SELECT 
			u.id, u.full_name, u.email, u.role, u.is_active, u.created_at,
			IFNULL(u.nickname,''), IFNULL(u.cohort,'')
		FROM supervisor_students ss
		JOIN users u ON u.id = ss.student_user_id
		WHERE ss.supervisor_user_id = ?
		  AND u.is_active = 1
		  AND (
		    LOWER(u.full_name) LIKE '%' || LOWER(?) || '%'
		    OR LOWER(u.email) LIKE '%' || LOWER(?) || '%'
		    OR LOWER(IFNULL(u.nickname,'')) LIKE '%' || LOWER(?) || '%'
		  )
		ORDER BY u.full_name ASC
		LIMIT 25
	`, supervisorUserID, q, q, q)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []models.User{}
	for rows.Next() {
		var u models.User
		var activeInt int
		if err := rows.Scan(
			&u.ID, &u.FullName, &u.Email, &u.Role, &activeInt, &u.CreatedAt,
			&u.Nickname, &u.Cohort,
		); err != nil {
			return nil, err
		}
		u.IsActive = activeInt == 1
		out = append(out, u)
	}
	return out, nil
}

func ListEligibleSupervisors(conn *sql.DB, q string) ([]models.User, error) {
	q = strings.TrimSpace(q)

	rows, err := conn.Query(`
		SELECT id, full_name, email, role, is_active, created_at
		FROM users
		WHERE role = 'supervisor'
		  AND is_active = 1
		  AND (
		    LOWER(full_name) LIKE '%' || LOWER(?) || '%'
		    OR LOWER(email) LIKE '%' || LOWER(?) || '%'
		  )
		ORDER BY full_name ASC
		LIMIT 25
	`, q, q)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []models.User{}
	for rows.Next() {
		var u models.User
		var activeInt int
		if err := rows.Scan(&u.ID, &u.FullName, &u.Email, &u.Role, &activeInt, &u.CreatedAt); err != nil {
			return nil, err
		}
		u.IsActive = activeInt == 1
		out = append(out, u)
	}
	return out, nil
}