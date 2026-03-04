package db

import (
	"strings"

	"taskflow/internal/models"
)

func GetUserByEmail(conn DBTX, email string) (id int64, fullName, passHash, role string, isActive bool, err error) {
	var activeInt int
	err = conn.QueryRow(`
		SELECT id, full_name, password_hash, role, is_active
		FROM users WHERE email = ?
	`, email).Scan(&id, &fullName, &passHash, &role, &activeInt)

	if err != nil {
		return 0, "", "", "", false, err
	}
	return id, fullName, passHash, role, activeInt == 1, nil
}

func GetUserBasic(conn DBTX, id int64) (fullName, email, role string, isActive bool, err error) {
	var activeInt int
	err = conn.QueryRow(`
		SELECT full_name, email, role, is_active
		FROM users WHERE id = ?
	`, id).Scan(&fullName, &email, &role, &activeInt)
	if err != nil {
		return "", "", "", false, err
	}
	return fullName, email, role, activeInt == 1, nil
}

func CreateUser(conn DBTX, fullName, email, passHash, role string) (int64, error) {
	res, err := conn.Exec(`
		INSERT INTO users (full_name, email, password_hash, role)
		VALUES (?, ?, ?, ?)
	`, strings.TrimSpace(fullName), strings.TrimSpace(email), passHash, strings.TrimSpace(role))
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func SearchUsersByRole(conn DBTX, role string, q string) ([]models.User, error) {
	q = strings.TrimSpace(q)

	rows, err := conn.Query(`
		SELECT id, full_name, email, role, is_active, created_at
		FROM users
		WHERE role = ? AND is_active = 1
		  AND (
		    LOWER(full_name) LIKE '%' || LOWER(?) || '%'
		    OR LOWER(email) LIKE '%' || LOWER(?) || '%'
		  )
		ORDER BY full_name ASC
		LIMIT 25
	`, role, q, q)
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

func SearchUsersStudentsAndSupervisors(conn DBTX, q string) ([]models.User, error) {
	q = strings.TrimSpace(q)

	rows, err := conn.Query(`
		SELECT id, full_name, email, role, is_active, created_at
		FROM users
		WHERE role IN ('student','supervisor')
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