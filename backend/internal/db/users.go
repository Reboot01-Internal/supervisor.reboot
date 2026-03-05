package db

import (
	"database/sql"
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

// ✅ UPDATED: add nickname + cohort
func CreateUser(conn DBTX, fullName, email, passHash, role, nickname, cohort string) (int64, error) {
	res, err := conn.Exec(`
		INSERT INTO users (full_name, email, password_hash, role, nickname, cohort)
		VALUES (?, ?, ?, ?, ?, ?)
	`, strings.TrimSpace(fullName),
		strings.TrimSpace(email),
		passHash,
		strings.TrimSpace(role),
		strings.TrimSpace(nickname),
		strings.TrimSpace(cohort),
	)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func SearchUsersByRole(conn DBTX, role string, q string) ([]models.User, error) {
	q = strings.TrimSpace(q)

	rows, err := conn.Query(`
		SELECT id, full_name, email, role, is_active, created_at,
		       IFNULL(nickname,''), IFNULL(cohort,'')
		FROM users
		WHERE role = ? AND is_active = 1
		  AND (
		    LOWER(full_name) LIKE '%' || LOWER(?) || '%'
		    OR LOWER(email) LIKE '%' || LOWER(?) || '%'
		    OR LOWER(IFNULL(nickname,'')) LIKE '%' || LOWER(?) || '%'
		  )
		ORDER BY full_name ASC
		LIMIT 25
	`, role, q, q, q)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []models.User{}
	for rows.Next() {
		var u models.User
		var activeInt int
		if err := rows.Scan(&u.ID, &u.FullName, &u.Email, &u.Role, &activeInt, &u.CreatedAt, &u.Nickname, &u.Cohort); err != nil {
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
		SELECT id, full_name, email, role, is_active, created_at,
		       IFNULL(nickname,''), IFNULL(cohort,'')
		FROM users
		WHERE role IN ('student','supervisor')
		  AND is_active = 1
		  AND (
		    LOWER(full_name) LIKE '%' || LOWER(?) || '%'
		    OR LOWER(email) LIKE '%' || LOWER(?) || '%'
		    OR LOWER(IFNULL(nickname,'')) LIKE '%' || LOWER(?) || '%'
		  )
		ORDER BY full_name ASC
		LIMIT 25
	`, q, q, q)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []models.User{}
	for rows.Next() {
		var u models.User
		var activeInt int
		if err := rows.Scan(&u.ID, &u.FullName, &u.Email, &u.Role, &activeInt, &u.CreatedAt, &u.Nickname, &u.Cohort); err != nil {
			return nil, err
		}
		u.IsActive = activeInt == 1
		out = append(out, u)
	}
	return out, nil
}

func UserExistsByEmail(conn DBTX, email string) (bool, error) {
	var id int64

	err := conn.QueryRow(`
		SELECT id FROM users
		WHERE LOWER(email)=LOWER(?)
		LIMIT 1
	`, email).Scan(&id)

	if err == sql.ErrNoRows {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return id > 0, nil
}

func UserExistsByNickname(conn DBTX, nickname string) (bool, error) {
	nickname = strings.TrimSpace(nickname)
	if nickname == "" {
		return false, nil
	}

	var id int64
	err := conn.QueryRow(`
		SELECT id FROM users
		WHERE LOWER(IFNULL(nickname,'')) = LOWER(?)
		LIMIT 1
	`, nickname).Scan(&id)

	if err == sql.ErrNoRows {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return id > 0, nil
}
func CreateUserMinimal(conn DBTX, fullName, email, passHash, role string) (int64, error) {
	// nickname/cohort can be empty for dev auto-create
	return CreateUser(conn, fullName, email, passHash, role, "", "")
}