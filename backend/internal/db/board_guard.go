package db

import "database/sql"

// Get supervisor user id that owns this board (via supervisor_files)
func GetBoardSupervisorUserID(conn *sql.DB, boardID int64) (int64, error) {
	var supID int64
	err := conn.QueryRow(`
		SELECT sf.supervisor_user_id
		FROM boards b
		JOIN supervisor_files sf ON sf.id = b.supervisor_file_id
		WHERE b.id = ?
	`, boardID).Scan(&supID)
	return supID, err
}

// func GetUserRole(conn *sql.DB, userID int64) (string, error) {
// 	var role string
// 	err := conn.QueryRow(`SELECT role FROM users WHERE id = ?`, userID).Scan(&role)
// 	return role, err
// }