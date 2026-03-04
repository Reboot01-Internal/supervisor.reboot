package db

import "database/sql"

func EnsureSupervisorFile(conn *sql.DB, supervisorUserID int64) error {
	// insert if not exists
	_, err := conn.Exec(`
		INSERT INTO supervisor_files (supervisor_user_id)
		VALUES (?)
		ON CONFLICT(supervisor_user_id) DO NOTHING
	`, supervisorUserID)
	return err
}

func GetSupervisorFileIDBySupervisorUserID(conn *sql.DB, supervisorUserID int64) (int64, error) {
	var fileID int64
	err := conn.QueryRow(`SELECT id FROM supervisor_files WHERE supervisor_user_id = ?`, supervisorUserID).Scan(&fileID)
	return fileID, err
}