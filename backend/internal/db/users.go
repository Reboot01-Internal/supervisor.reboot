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

func GetUserDisplayName(conn DBTX, id int64) (string, error) {
	var fullName, nickname string
	err := conn.QueryRow(`
		SELECT full_name, IFNULL(nickname, '')
		FROM users
		WHERE id = ?
	`, id).Scan(&fullName, &nickname)
	if err != nil {
		return "", err
	}

	nickname = strings.TrimSpace(nickname)
	if nickname != "" {
		return nickname, nil
	}
	return strings.TrimSpace(fullName), nil
}

// UPDATED: add nickname + cohort
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
		SELECT u.id, u.full_name, u.email, ?, u.is_active, u.created_at,
		       IFNULL(u.nickname,''), IFNULL(u.cohort,''),
		       IFNULL(GROUP_CONCAT(DISTINCT b.name), '')
		FROM users u
		LEFT JOIN board_members bm ON bm.user_id = u.id
		LEFT JOIN boards b ON b.id = bm.board_id
		WHERE u.is_active = 1
		  AND (
		    u.role = ?
		    OR EXISTS (
		      SELECT 1
		      FROM user_roles ur
		      WHERE ur.user_id = u.id AND ur.role = ?
		    )
		  )
		  AND (
		    LOWER(u.full_name) LIKE '%' || LOWER(?) || '%'
		    OR LOWER(u.email) LIKE '%' || LOWER(?) || '%'
		    OR LOWER(IFNULL(u.nickname,'')) LIKE '%' || LOWER(?) || '%'
		  )
		GROUP BY u.id, u.full_name, u.email, u.is_active, u.created_at, u.nickname, u.cohort
		ORDER BY u.full_name ASC
	`, role, role, role, q, q, q)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []models.User{}
	for rows.Next() {
		var u models.User
		var activeInt int
		var assignedBoardsCSV string
		if err := rows.Scan(&u.ID, &u.FullName, &u.Email, &u.Role, &activeInt, &u.CreatedAt, &u.Nickname, &u.Cohort, &assignedBoardsCSV); err != nil {
			return nil, err
		}
		u.IsActive = activeInt == 1
		u.AssignedBoards = splitAssignedBoardsCSV(assignedBoardsCSV)
		out = append(out, u)
	}
	return out, nil
}

func SearchUsersStudentsAndSupervisors(conn DBTX, q string) ([]models.User, error) {
	q = strings.TrimSpace(q)

	rows, err := conn.Query(`
		SELECT
			u.id,
			u.full_name,
			u.email,
			CASE
				WHEN u.role IN ('student', 'supervisor') THEN u.role
				WHEN EXISTS (
					SELECT 1
					FROM user_roles ur
					WHERE ur.user_id = u.id AND ur.role = 'supervisor'
				) THEN 'supervisor'
				WHEN EXISTS (
					SELECT 1
					FROM user_roles ur
					WHERE ur.user_id = u.id AND ur.role = 'student'
				) THEN 'student'
				ELSE u.role
			END,
			u.is_active,
			u.created_at,
			IFNULL(u.nickname,''),
			IFNULL(u.cohort,''),
			IFNULL(GROUP_CONCAT(DISTINCT b.name), '')
		FROM users u
		LEFT JOIN board_members bm ON bm.user_id = u.id
		LEFT JOIN boards b ON b.id = bm.board_id
		WHERE u.is_active = 1
		  AND (
		    u.role IN ('student','supervisor')
		    OR EXISTS (
		      SELECT 1
		      FROM user_roles ur
		      WHERE ur.user_id = u.id AND ur.role IN ('student', 'supervisor')
		    )
		  )
		  AND (
		    LOWER(u.full_name) LIKE '%' || LOWER(?) || '%'
		    OR LOWER(u.email) LIKE '%' || LOWER(?) || '%'
		    OR LOWER(IFNULL(u.nickname,'')) LIKE '%' || LOWER(?) || '%'
		  )
		GROUP BY u.id, u.full_name, u.email, u.role, u.is_active, u.created_at, u.nickname, u.cohort
		ORDER BY u.full_name ASC
	`, q, q, q)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []models.User{}
	for rows.Next() {
		var u models.User
		var activeInt int
		var assignedBoardsCSV string
		if err := rows.Scan(&u.ID, &u.FullName, &u.Email, &u.Role, &activeInt, &u.CreatedAt, &u.Nickname, &u.Cohort, &assignedBoardsCSV); err != nil {
			return nil, err
		}
		u.IsActive = activeInt == 1
		u.AssignedBoards = splitAssignedBoardsCSV(assignedBoardsCSV)
		out = append(out, u)
	}
	return out, nil
}

func splitAssignedBoardsCSV(raw string) []string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return []string{}
	}
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	seen := make(map[string]bool, len(parts))
	for _, part := range parts {
		name := strings.TrimSpace(part)
		if name == "" || seen[name] {
			continue
		}
		seen[name] = true
		out = append(out, name)
	}
	return out
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

func GetUserByNickname(conn DBTX, nickname string) (id int64, fullName, email, role string, isActive bool, err error) {
	var activeInt int
	err = conn.QueryRow(`
		SELECT id, full_name, email, role, is_active
		FROM users
		WHERE LOWER(IFNULL(nickname,'')) = LOWER(?)
		LIMIT 1
	`, nickname).Scan(&id, &fullName, &email, &role, &activeInt)
	if err != nil {
		return 0, "", "", "", false, err
	}
	return id, fullName, email, role, activeInt == 1, nil
}

func UpdateUserNickname(conn DBTX, userID int64, nickname string) error {
	_, err := conn.Exec(`
		UPDATE users
		SET nickname = NULLIF(TRIM(?), '')
		WHERE id = ?
	`, nickname, userID)
	return err
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
func GetBoardMemberIDs(conn DBTX, boardID int64) (map[int64]bool, error) {
	rows, err := conn.Query(`SELECT user_id FROM board_members WHERE board_id = ?`, boardID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	m := map[int64]bool{}
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		m[id] = true
	}
	return m, nil
}

func DeleteUserByID(conn *sql.DB, userID int64) error {
	tx, err := conn.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	_, err = tx.Exec(`UPDATE boards SET created_by = ? WHERE created_by = ?`, int64(1), userID)
	if err != nil {
		return err
	}

	_, err = tx.Exec(`DELETE FROM users WHERE id = ?`, userID)
	if err != nil {
		return err
	}

	return tx.Commit()
}
